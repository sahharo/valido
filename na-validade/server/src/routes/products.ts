import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CATEGORIES, UNITS } from '../../../shared/domain.ts'
import { requirePermission } from '../auth/context.ts'
import { db } from '../db/client.ts'
import { lots, products } from '../db/schema.ts'
import { audit } from '../lib/audit.ts'
import { conflict, HttpError, notFound, parse } from '../lib/http.ts'
import { barcode, idParam, money, optionalText } from '../lib/schemas.ts'
import { containsPattern } from '../lib/sql.ts'
import { activeLotsIn, fefoOrder, selectLots, withExpiry } from '../services/lotQueries.ts'
import { lookupExternal, LookupUnavailableError } from '../services/productLookup.ts'

const productBody = z.object({
  barcode,
  name: z.string().trim().min(2, 'Informe o nome do produto.').max(200),
  brand: optionalText(100),
  category: z.enum(CATEGORIES, 'Escolha a categoria.'),
  unit: z.enum(UNITS, 'Escolha a unidade.').default('un'),
  costPrice: money,
  imageUrl: z.url({ protocol: /^https$/ }).max(500).nullable().optional(),
  source: z.enum(['manual', 'external_api']).default('manual'),
})

const productCols = {
  id: products.id, barcode: products.barcode, name: products.name, brand: products.brand,
  category: products.category, unit: products.unit, imageUrl: products.imageUrl, costPrice: products.costPrice,
  source: products.source, createdAt: products.createdAt, updatedAt: products.updatedAt,
}

export async function productRoutes(app: FastifyInstance) {
  // Catalog search with the number of active lots in the user's stores.
  app.get('/api/products', async (req) => {
    const ctx = req.auth
    const { q, category, limit, offset } = parse(
      z.object({
        q: z.string().trim().max(100).optional(),
        category: z.enum(CATEGORIES).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      req.query,
    )
    const pattern = q ? containsPattern(q) : undefined
    const where = and(
      eq(products.companyId, ctx.company.id),
      isNull(products.archivedAt),
      category ? eq(products.category, category) : undefined,
      pattern ? or(ilike(products.name, pattern), ilike(products.brand, pattern), ilike(products.barcode, pattern)) : undefined,
    )
    const stats = db
      .select({
        productId: lots.productId,
        activeLots: sql<number>`count(*)`.mapWith(Number).as('active_lots'),
        nextExpiry: sql<string>`min(${lots.expiryDate})`.as('next_expiry'),
      })
      .from(lots)
      .where(activeLotsIn(ctx.company.id, ctx.storeIds))
      .groupBy(lots.productId)
      .as('stats')
    const items = await db
      .select({ ...productCols, activeLots: sql<number>`coalesce(${stats.activeLots}, 0)`.mapWith(Number), nextExpiry: stats.nextExpiry })
      .from(products)
      .leftJoin(stats, eq(stats.productId, products.id))
      .where(where)
      .orderBy(asc(products.name))
      .limit(limit)
      .offset(offset)
    return { items }
  })

  // Internal catalog first: this is the source of truth once a product is registered.
  app.get('/api/products/by-barcode/:barcode', async (req) => {
    const ctx = req.auth
    const code = parse(z.object({ barcode }), req.params).barcode
    const [product] = await db
      .select(productCols)
      .from(products)
      .where(and(eq(products.companyId, ctx.company.id), eq(products.barcode, code), isNull(products.archivedAt)))
    if (!product) throw notFound('Produto não encontrado.', 'product_not_found')
    const productLots = await selectLots(and(activeLotsIn(ctx.company.id, ctx.storeIds), eq(lots.productId, product.id))).orderBy(...fefoOrder)
    return { product, lots: productLots.map(withExpiry) }
  })

  // External suggestion (auxiliary source), only used to pre-fill the registration form.
  // Anyone who registers lots can see the suggestion, so the product shows up as soon as the code is typed.
  app.get('/api/products/external/:barcode', async (req) => {
    requirePermission(req.auth, 'lots:write')
    const code = parse(z.object({ barcode }), req.params).barcode
    try {
      const suggestion = await lookupExternal(code)
      if (!suggestion) throw notFound('Produto não encontrado na base externa.', 'external_not_found')
      return { suggestion }
    } catch (err) {
      if (err instanceof LookupUnavailableError) throw new HttpError(503, 'A base externa de produtos não respondeu.', 'external_unavailable')
      throw err
    }
  })

  // Registers a product straight from the external database, so the user does not have to type it.
  // The data comes from the server-side (cached) lookup, never from the client, which is why
  // anyone allowed to register lots may use it. Only the category can be chosen when the source has none.
  app.post('/api/products/import', async (req, reply) => {
    const ctx = req.auth
    requirePermission(ctx, 'lots:write')
    const data = parse(z.object({ barcode, category: z.enum(CATEGORIES).optional() }), req.body)
    const [existing] = await db
      .select()
      .from(products)
      .where(and(eq(products.companyId, ctx.company.id), eq(products.barcode, data.barcode)))
    if (existing && !existing.archivedAt) {
      const [product] = await db.select(productCols).from(products).where(eq(products.id, existing.id))
      return { product }
    }
    let ext
    try {
      ext = await lookupExternal(data.barcode)
    } catch (err) {
      if (err instanceof LookupUnavailableError) throw new HttpError(503, 'A base externa de produtos não respondeu.', 'external_unavailable')
      throw err
    }
    if (!ext) throw notFound('Produto não encontrado na base externa.', 'external_not_found')
    const values = {
      barcode: data.barcode, name: ext.name, brand: ext.brand, category: ext.category ?? data.category ?? 'Outros',
      unit: 'un', imageUrl: ext.imageUrl, source: 'external_api' as const,
    }
    const [product] = existing
      ? await db.update(products).set({ ...values, archivedAt: null, updatedAt: new Date() }).where(eq(products.id, existing.id)).returning(productCols)
      : await db.insert(products).values({ ...values, companyId: ctx.company.id, createdBy: ctx.user.id }).returning(productCols)
    await audit(req, 'product_import', 'product', product.id, { barcode: data.barcode, name: ext.name, source: ext.source })
    return reply.status(201).send({ product })
  })

  app.get('/api/products/:id', async (req) => {
    const ctx = req.auth
    const { id } = parse(idParam, req.params)
    const [product] = await db.select(productCols).from(products).where(and(eq(products.id, id), eq(products.companyId, ctx.company.id)))
    if (!product) throw notFound('Produto não encontrado.')
    const productLots = await selectLots(and(activeLotsIn(ctx.company.id, ctx.storeIds), eq(lots.productId, id))).orderBy(...fefoOrder)
    return { product, lots: productLots.map(withExpiry) }
  })

  app.post('/api/products', async (req, reply) => {
    const ctx = req.auth
    requirePermission(ctx, 'products:write')
    const data = parse(productBody, req.body)
    const [existing] = await db
      .select()
      .from(products)
      .where(and(eq(products.companyId, ctx.company.id), eq(products.barcode, data.barcode)))
    if (existing && !existing.archivedAt) throw conflict('Este código já está cadastrado.', 'product_exists', { id: existing.id })

    const values = { ...data, brand: data.brand ?? null, costPrice: data.costPrice ?? null, imageUrl: data.imageUrl ?? null }
    const [product] = existing
      ? await db.update(products).set({ ...values, archivedAt: null, updatedAt: new Date() }).where(eq(products.id, existing.id)).returning(productCols)
      : await db.insert(products).values({ ...values, companyId: ctx.company.id, createdBy: ctx.user.id }).returning(productCols)
    await audit(req, existing ? 'product_restore' : 'product_create', 'product', product.id, { barcode: data.barcode, name: data.name })
    return reply.status(201).send({ product })
  })

  app.patch('/api/products/:id', async (req) => {
    const ctx = req.auth
    requirePermission(ctx, 'products:write')
    const { id } = parse(idParam, req.params)
    const data = parse(productBody.omit({ barcode: true, source: true }).partial(), req.body)
    const [product] = await db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(products.id, id), eq(products.companyId, ctx.company.id), isNull(products.archivedAt)))
      .returning(productCols)
    if (!product) throw notFound('Produto não encontrado.')
    await audit(req, 'product_update', 'product', id, data)
    return { product }
  })

  app.post('/api/products/:id/archive', async (req) => {
    const ctx = req.auth
    requirePermission(ctx, 'records:archive')
    const { id } = parse(idParam, req.params)
    const [active] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(lots)
      .where(and(eq(lots.companyId, ctx.company.id), eq(lots.productId, id), eq(lots.status, 'active')))
    if (active.n > 0) throw conflict('Este produto ainda tem lotes ativos. Retire os lotes antes de arquivar.')
    const [product] = await db
      .update(products)
      .set({ archivedAt: new Date() })
      .where(and(eq(products.id, id), eq(products.companyId, ctx.company.id), isNull(products.archivedAt)))
      .returning({ id: products.id })
    if (!product) throw notFound('Produto não encontrado.')
    await audit(req, 'product_archive', 'product', id)
    return { ok: true }
  })
}
