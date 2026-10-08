import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CATEGORIES, WITHDRAWAL_REASONS } from '../../../shared/domain.ts'
import { assertStoreAccess, inStores, requirePermission, storeScope, type AuthContext } from '../auth/context.ts'
import { db, type Tx } from '../db/client.ts'
import { goodsReceipts, lotMovements, lots, products, stores, users } from '../db/schema.ts'
import { audit } from '../lib/audit.ts'
import { badRequest, conflict, notFound, parse } from '../lib/http.ts'
import { idParam, isoDate, money, optionalId, optionalText, quantity } from '../lib/schemas.ts'
import { containsPattern, round } from '../lib/sql.ts'
import { activeLotsIn, bucket, fefoOrder, selectLots, withExpiry } from '../services/lotQueries.ts'

const lotFields = {
  productId: z.coerce.number().int().positive('Escolha o produto.'),
  lotNumber: optionalText(60),
  // Optional in the form: a lot without a quantity counts as 1 unit.
  quantity: quantity.default(1),
  expiryDate: isoDate,
  unitCost: money,
  notes: optionalText(500),
  source: z.enum(['manual', 'ocr']).default('manual'),
}
type LotInput = z.infer<z.ZodObject<typeof lotFields>> & { storeId: number }

// A lot can be registered in several stores at once (storeIds): one lot per store, same quantity and expiry.
const lotBody = z
  .object({ ...lotFields, storeId: optionalId, storeIds: z.array(z.coerce.number().int().positive()).max(50).optional() })
  .transform(({ storeId, storeIds, ...rest }) => ({ ...rest, storeIds: [...new Set(storeIds?.length ? storeIds : storeId ? [storeId] : [])] }))
  .refine((d) => d.storeIds.length > 0, 'Escolha a loja.')

const STATUS_FILTERS = ['active', 'expired', 'week', 'month', 'ok', 'withdrawn', 'archived'] as const

const listQuery = z.object({
  storeId: optionalId,
  status: z.enum(STATUS_FILTERS).default('active'),
  category: z.enum(CATEGORIES).optional(),
  productId: optionalId,
  q: z.string().trim().max(100).optional(),
  expiryFrom: isoDate.optional(),
  expiryTo: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

// Rejects obvious typos (e.g. year 2062 instead of 2026) without blocking already-expired lots found on shelves.
function assertPlausibleExpiry(date: string) {
  const year = Number(date.slice(0, 4))
  const now = new Date().getFullYear()
  if (year < now - 5 || year > now + 15) throw badRequest('Confira a data de validade.')
}

async function createLot(tx: Tx, ctx: AuthContext, data: LotInput, receiptId: number | null = null) {
  assertStoreAccess(ctx, data.storeId)
  assertPlausibleExpiry(data.expiryDate)
  const [product] = await tx
    .select({ id: products.id, costPrice: products.costPrice })
    .from(products)
    .where(and(eq(products.id, data.productId), eq(products.companyId, ctx.company.id), isNull(products.archivedAt)))
  if (!product) throw notFound('Produto não encontrado.')
  const unitCost = data.unitCost ?? product.costPrice
  const [lot] = await tx
    .insert(lots)
    .values({
      companyId: ctx.company.id, productId: product.id, storeId: data.storeId, receiptId,
      lotNumber: data.lotNumber, initialQuantity: data.quantity, quantity: data.quantity, expiryDate: data.expiryDate,
      unitCost, notes: data.notes, source: data.source, createdBy: ctx.user.id,
    })
    .returning()
  await tx.insert(lotMovements).values({
    companyId: ctx.company.id, lotId: lot.id, productId: product.id, storeId: data.storeId, type: 'entry',
    quantity: data.quantity, unitCost, totalCost: unitCost == null ? null : round(unitCost * data.quantity, 2),
    userId: ctx.user.id,
  })
  return lot
}

// Locks a lot of the user's company/stores for a state change.
async function lockLot(tx: Tx, ctx: AuthContext, id: number) {
  const [lot] = await tx
    .select({ lot: lots, costPrice: products.costPrice })
    .from(lots)
    .innerJoin(products, eq(products.id, lots.productId))
    .where(and(eq(lots.id, id), eq(lots.companyId, ctx.company.id), inStores(lots.storeId, ctx.storeIds)))
    .for('update', { of: lots })
  if (!lot) throw notFound('Lote não encontrado.')
  return lot
}

async function lotById(ctx: AuthContext, id: number) {
  const [lot] = await selectLots(and(eq(lots.id, id), eq(lots.companyId, ctx.company.id), inStores(lots.storeId, ctx.storeIds)))
  if (!lot) throw notFound('Lote não encontrado.')
  return withExpiry(lot)
}

export async function lotRoutes(app: FastifyInstance) {
  app.get('/api/lots', async (req) => {
    const ctx = req.auth
    const f = parse(listQuery, req.query)
    if (f.status === 'archived') requirePermission(ctx, 'records:archive')
    const scope = storeScope(ctx, f.storeId)
    const pattern = f.q ? containsPattern(f.q) : undefined
    const statusCond: Record<(typeof STATUS_FILTERS)[number], SQL | undefined> = {
      active: eq(lots.status, 'active'),
      expired: and(eq(lots.status, 'active'), bucket.expired),
      week: and(eq(lots.status, 'active'), bucket.week),
      month: and(eq(lots.status, 'active'), bucket.month),
      ok: and(eq(lots.status, 'active'), bucket.ok),
      withdrawn: eq(lots.status, 'withdrawn'),
      archived: eq(lots.status, 'archived'),
    }
    const where = and(
      eq(lots.companyId, ctx.company.id),
      inStores(lots.storeId, scope),
      statusCond[f.status],
      f.category ? eq(products.category, f.category) : undefined,
      f.productId ? eq(lots.productId, f.productId) : undefined,
      f.expiryFrom ? gte(lots.expiryDate, f.expiryFrom) : undefined,
      f.expiryTo ? lte(lots.expiryDate, f.expiryTo) : undefined,
      pattern
        ? or(ilike(products.name, pattern), ilike(products.brand, pattern), ilike(products.barcode, pattern), ilike(lots.lotNumber, pattern))
        : undefined,
    )
    const order =
      f.status === 'withdrawn' ? [desc(lots.withdrawnAt)] : f.status === 'archived' ? [desc(lots.archivedAt)] : fefoOrder
    const [items, [{ total }]] = await Promise.all([
      selectLots(where).orderBy(...order).limit(f.limit).offset(f.offset),
      db
        .select({ total: sql<number>`count(*)`.mapWith(Number) })
        .from(lots)
        .innerJoin(products, eq(products.id, lots.productId))
        .where(where),
    ])
    return { items: items.map(withExpiry), total }
  })

  // Lot details, its full movement history and the other active lots of the same product (FEFO order).
  app.get('/api/lots/:id', async (req) => {
    const ctx = req.auth
    const { id } = parse(idParam, req.params)
    const lot = await lotById(ctx, id)
    const [movements, siblings] = await Promise.all([
      db
        .select({
          id: lotMovements.id, type: lotMovements.type, quantity: lotMovements.quantity, reason: lotMovements.reason,
          unitCost: lotMovements.unitCost, totalCost: lotMovements.totalCost, notes: lotMovements.notes,
          createdAt: lotMovements.createdAt, user: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        })
        .from(lotMovements)
        .innerJoin(users, eq(users.id, lotMovements.userId))
        .where(and(eq(lotMovements.lotId, id), eq(lotMovements.companyId, ctx.company.id)))
        .orderBy(asc(lotMovements.createdAt), asc(lotMovements.id)),
      selectLots(and(activeLotsIn(ctx.company.id, ctx.storeIds), eq(lots.productId, lot.product.id))).orderBy(...fefoOrder),
    ])
    return { lot, movements, fefo: siblings.map(withExpiry) }
  })

  app.post('/api/lots', async (req, reply) => {
    const ctx = req.auth
    requirePermission(ctx, 'lots:write')
    const { storeIds, ...data } = parse(lotBody, req.body)
    // All-or-nothing: if any store is not allowed, no lot is created.
    const created = await db.transaction(async (tx) => {
      const rows = []
      for (const storeId of storeIds) {
        const lot = await createLot(tx, ctx, { ...data, storeId })
        await audit(req, 'lot_create', 'lot', lot.id, { productId: data.productId, storeId, quantity: data.quantity, expiryDate: data.expiryDate }, tx)
        rows.push(lot)
      }
      return rows
    })
    const lotsOut = await Promise.all(created.map((l) => lotById(ctx, l.id)))
    return reply.status(201).send({ lot: lotsOut[0], lots: lotsOut })
  })

  // Withdrawal from the shelf (total or partial). Never deletes: the lot keeps its history.
  app.post('/api/lots/:id/withdraw', async (req) => {
    const ctx = req.auth
    requirePermission(ctx, 'lots:withdraw')
    const { id } = parse(idParam, req.params)
    const data = parse(
      z.object({ quantity: quantity.optional(), reason: z.enum(WITHDRAWAL_REASONS, 'Escolha o motivo.'), notes: optionalText(500) }),
      req.body,
    )
    if (data.reason === 'other' && !data.notes) throw badRequest('Descreva o motivo da retirada.')
    await db.transaction(async (tx) => {
      const { lot, costPrice } = await lockLot(tx, ctx, id)
      if (lot.status !== 'active') throw conflict('Este lote já foi retirado.')
      const qty = data.quantity ?? lot.quantity
      if (qty > lot.quantity) throw badRequest(`A quantidade máxima para retirar é ${lot.quantity}.`)
      const remaining = round(lot.quantity - qty, 3)
      const unitCost = lot.unitCost ?? costPrice
      await tx.insert(lotMovements).values({
        companyId: ctx.company.id, lotId: lot.id, productId: lot.productId, storeId: lot.storeId, type: 'withdrawal',
        quantity: qty, reason: data.reason, unitCost, totalCost: unitCost == null ? null : round(unitCost * qty, 2),
        notes: data.notes, userId: ctx.user.id,
      })
      await tx
        .update(lots)
        .set(
          remaining > 0
            ? { quantity: remaining }
            : { quantity: 0, status: 'withdrawn', withdrawnAt: new Date(), withdrawnBy: ctx.user.id, withdrawalReason: data.reason },
        )
        .where(eq(lots.id, lot.id))
      await audit(req, 'lot_withdraw', 'lot', lot.id, { quantity: qty, reason: data.reason, remaining }, tx)
    })
    return { lot: await lotById(ctx, id) }
  })

  // Administrative archive (soft delete), e.g. for a lot registered by mistake. History is preserved.
  app.post('/api/lots/:id/archive', async (req) => {
    const ctx = req.auth
    requirePermission(ctx, 'records:archive')
    const { id } = parse(idParam, req.params)
    const { notes } = parse(z.object({ notes: z.string().trim().min(3, 'Informe o motivo do arquivamento.').max(500) }), req.body)
    await db.transaction(async (tx) => {
      const { lot } = await lockLot(tx, ctx, id)
      if (lot.status === 'archived') throw conflict('Este lote já está arquivado.')
      await tx.insert(lotMovements).values({
        companyId: ctx.company.id, lotId: lot.id, productId: lot.productId, storeId: lot.storeId, type: 'archive',
        quantity: lot.quantity, notes, userId: ctx.user.id,
      })
      await tx.update(lots).set({ status: 'archived', archivedAt: new Date(), archivedBy: ctx.user.id }).where(eq(lots.id, lot.id))
      await audit(req, 'lot_archive', 'lot', lot.id, { notes }, tx)
    })
    return { lot: await lotById(ctx, id) }
  })

  // Goods receipt ("Nova entrada"): several lots that arrived together, created atomically.
  app.post('/api/receipts', async (req, reply) => {
    const ctx = req.auth
    requirePermission(ctx, 'lots:write')
    const data = parse(
      z.object({
        storeId: z.coerce.number().int().positive('Escolha a loja.'),
        invoiceNumber: optionalText(60),
        supplier: optionalText(120),
        notes: optionalText(500),
        items: z.array(z.object(lotFields)).min(1, 'Adicione pelo menos um item.').max(200),
      }),
      req.body,
    )
    assertStoreAccess(ctx, data.storeId)
    const receipt = await db.transaction(async (tx) => {
      const [r] = await tx
        .insert(goodsReceipts)
        .values({ companyId: ctx.company.id, storeId: data.storeId, invoiceNumber: data.invoiceNumber, supplier: data.supplier, notes: data.notes, createdBy: ctx.user.id })
        .returning()
      for (const item of data.items) await createLot(tx, ctx, { ...item, storeId: data.storeId }, r.id)
      await audit(req, 'receipt_create', 'goods_receipt', r.id, { items: data.items.length }, tx)
      return r
    })
    return reply.status(201).send({ receipt })
  })

  app.get('/api/receipts', async (req) => {
    const ctx = req.auth
    const { storeId } = parse(z.object({ storeId: optionalId }), req.query)
    const items = await db
      .select({
        id: goodsReceipts.id, invoiceNumber: goodsReceipts.invoiceNumber, supplier: goodsReceipts.supplier,
        createdAt: goodsReceipts.createdAt, store: stores.name,
        lots: sql<number>`(select count(*) from ${lots} where ${lots.receiptId} = ${goodsReceipts.id})`.mapWith(Number),
      })
      .from(goodsReceipts)
      .innerJoin(stores, eq(stores.id, goodsReceipts.storeId))
      .where(and(eq(goodsReceipts.companyId, ctx.company.id), inStores(goodsReceipts.storeId, storeScope(ctx, storeId))))
      .orderBy(desc(goodsReceipts.createdAt))
      .limit(50)
    return { items }
  })
}
