import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ROLES } from '../../../shared/domain.ts'
import { isValidCNPJ, onlyDigits, UFS } from '../../../shared/validation.ts'
import { loadContext, requirePermission } from '../auth/context.ts'
import { hashPassword } from '../auth/password.ts'
import { destroyUserSessions } from '../auth/session.ts'
import { db } from '../db/client.ts'
import { auditLogs, companies, lots, stores, users, userStores } from '../db/schema.ts'
import { audit } from '../lib/audit.ts'
import { badRequest, conflict, notFound, parse } from '../lib/http.ts'
import { idParam } from '../lib/schemas.ts'
import { assertContactFree, assertIdentifiersFree, passwordField, personFields, serializeMe } from './auth.ts'

// Required trimmed text with a friendly message when missing.
const requiredText = (max: number, message: string) => z.string(message).trim().min(1, message).max(max)

// CNPJ, address, street number and city are required for every store.
const storeBody = z.object({
  name: z.string().trim().min(2, 'Informe o nome da loja.').max(80),
  cnpj: z.string('Informe o CNPJ da loja.').transform(onlyDigits).refine(isValidCNPJ, 'CNPJ da loja inválido.'),
  city: requiredText(80, 'Informe a cidade da loja.'),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => !v || (UFS as readonly string[]).includes(v), 'UF inválida.')
    .optional()
    .nullable()
    .transform((v) => v || null),
  address: requiredText(200, 'Informe o endereço da loja.'),
  addressNumber: requiredText(20, 'Informe o número do endereço da loja.'),
  // Optional CEP (8 digits), stored without the mask.
  cep: z
    .string()
    .optional()
    .nullable()
    .transform((v) => onlyDigits(v ?? '') || null)
    .refine((v) => !v || v.length === 8, 'CEP inválido.'),
})

const userStoreIds = z.array(z.coerce.number().int().positive()).max(200)

export async function adminRoutes(app: FastifyInstance) {
  app.get('/api/stores', async (req) => ({ items: req.auth.stores }))

  // Accepts several stores at once (sign-up onboarding: "Quantas lojas você tem?").
  app.post('/api/stores', async (req, reply) => {
    const ctx = req.auth
    requirePermission(ctx, 'stores:manage')
    const { stores: list } = parse(z.object({ stores: z.array(storeBody).min(1).max(50) }), req.body)
    const created = await db.transaction(async (tx) => {
      const rows = await tx.insert(stores).values(list.map((s) => ({ ...s, companyId: ctx.company.id }))).returning()
      for (const s of rows) await audit(req, 'store_create', 'store', s.id, { name: s.name }, tx)
      return rows
    })
    return reply.status(201).send({ items: created })
  })

  app.patch('/api/stores/:id', async (req) => {
    const ctx = req.auth
    requirePermission(ctx, 'stores:manage')
    const { id } = parse(idParam, req.params)
    const data = parse(storeBody.partial(), req.body)
    const [store] = await db
      .update(stores)
      .set(data)
      .where(and(eq(stores.id, id), eq(stores.companyId, ctx.company.id), isNull(stores.archivedAt)))
      .returning()
    if (!store) throw notFound('Loja não encontrada.')
    await audit(req, 'store_update', 'store', id, data)
    return { store }
  })

  app.post('/api/stores/:id/archive', async (req) => {
    const ctx = req.auth
    requirePermission(ctx, 'stores:manage')
    const { id } = parse(idParam, req.params)
    if (!ctx.storeIds.includes(id)) throw notFound('Loja não encontrada.')
    if (ctx.storeIds.length === 1) throw conflict('A empresa precisa ter pelo menos uma loja.')
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(lots)
      .where(and(eq(lots.storeId, id), eq(lots.status, 'active')))
    if (n > 0) throw conflict(`Esta loja ainda tem ${n} lote(s) ativo(s). Retire os lotes antes de arquivar a loja.`)
    await db.update(stores).set({ archivedAt: new Date() }).where(and(eq(stores.id, id), eq(stores.companyId, ctx.company.id)))
    await audit(req, 'store_archive', 'store', id)
    return { ok: true }
  })

  app.get('/api/users', async (req) => {
    const ctx = req.auth
    requirePermission(ctx, 'users:manage')
    const list = await db
      .select({
        id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, phone: users.phone,
        jobTitle: users.jobTitle, role: users.role, active: users.active, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.companyId, ctx.company.id))
      .orderBy(asc(users.firstName))
    const links = list.length
      ? await db.select().from(userStores).where(inArray(userStores.userId, list.map((u) => u.id)))
      : []
    return { items: list.map((u) => ({ ...u, storeIds: links.filter((l) => l.userId === u.id).map((l) => l.storeId) })) }
  })

  app.post('/api/users', async (req, reply) => {
    const ctx = req.auth
    requirePermission(ctx, 'users:manage')
    const data = parse(
      z.object({ ...personFields, role: z.enum(ROLES, 'Escolha o perfil de acesso.'), storeIds: userStoreIds, password: passwordField }),
      req.body,
    )
    if (data.role !== 'admin' && !data.storeIds.length) throw badRequest('Escolha pelo menos uma loja para este usuário.')
    if (data.storeIds.some((id) => !ctx.storeIds.includes(id))) throw badRequest('Loja inválida.')
    await assertIdentifiersFree(data)
    const passwordHash = await hashPassword(data.password)
    const user = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          companyId: ctx.company.id, firstName: data.firstName, lastName: data.lastName, email: data.email, phone: data.phone,
          document: data.document, documentType: data.document ? 'cpf' : null, jobTitle: data.jobTitle,
          role: data.role, passwordHash,
        })
        .returning({ id: users.id })
      if (data.storeIds.length) await tx.insert(userStores).values(data.storeIds.map((storeId) => ({ userId: u.id, storeId })))
      await audit(req, 'user_create', 'user', u.id, { role: data.role, storeIds: data.storeIds }, tx)
      return u
    })
    return reply.status(201).send({ id: user.id })
  })

  app.patch('/api/users/:id', async (req) => {
    const ctx = req.auth
    requirePermission(ctx, 'users:manage')
    const { id } = parse(idParam, req.params)
    const data = parse(
      z.object({
        // Admins can fix a team member's name, e-mail (their login) and phone.
        firstName: personFields.firstName, lastName: personFields.lastName, email: personFields.email, phone: personFields.phone,
        role: z.enum(ROLES), jobTitle: personFields.jobTitle, storeIds: userStoreIds, active: z.boolean(),
      }).partial(),
      req.body,
    )
    const [target] = await db.select().from(users).where(and(eq(users.id, id), eq(users.companyId, ctx.company.id)))
    if (!target) throw notFound('Usuário não encontrado.')
    await assertContactFree(id, data)
    if (id === ctx.user.id && ((data.role && data.role !== 'admin') || data.active === false))
      throw badRequest('Você não pode remover o seu próprio acesso de administrador.')
    if (data.storeIds?.some((s) => !ctx.storeIds.includes(s))) throw badRequest('Loja inválida.')
    const { storeIds, ...fields } = data
    await db.transaction(async (tx) => {
      if (Object.keys(fields).length) await tx.update(users).set(fields).where(eq(users.id, id))
      if (storeIds) {
        await tx.delete(userStores).where(eq(userStores.userId, id))
        if (storeIds.length) await tx.insert(userStores).values(storeIds.map((storeId) => ({ userId: id, storeId })))
      }
      await audit(req, 'user_update', 'user', id, data, tx)
    })
    if (data.active === false) await destroyUserSessions(id)
    return { ok: true }
  })

  app.post('/api/users/:id/password', async (req) => {
    const ctx = req.auth
    requirePermission(ctx, 'users:manage')
    const { id } = parse(idParam, req.params)
    const { password } = parse(z.object({ password: passwordField }), req.body)
    const [u] = await db
      .update(users)
      .set({ passwordHash: await hashPassword(password) })
      .where(and(eq(users.id, id), eq(users.companyId, ctx.company.id)))
      .returning({ id: users.id })
    if (!u) throw notFound('Usuário não encontrado.')
    await destroyUserSessions(id)
    await audit(req, 'user_password_reset', 'user', id)
    return { ok: true }
  })

  app.patch('/api/company', async (req) => {
    const ctx = req.auth
    requirePermission(ctx, 'settings:manage')
    const data = parse(
      z.object({
        name: z.string().trim().min(2, 'Informe o nome da empresa.').max(120).optional(),
        settings: z.object({ employeesCanCreateProducts: z.boolean() }).optional(),
      }),
      req.body,
    )
    await db
      .update(companies)
      .set({ ...(data.name && { name: data.name }), ...(data.settings && { settings: { ...ctx.company.settings, ...data.settings } }) })
      .where(eq(companies.id, ctx.company.id))
    await audit(req, 'company_update', 'company', ctx.company.id, data)
    return serializeMe((await loadContext(ctx.user.id))!)
  })

  app.get('/api/audit', async (req) => {
    const ctx = req.auth
    requirePermission(ctx, 'settings:manage')
    const items = await db
      .select({
        id: auditLogs.id, action: auditLogs.action, entity: auditLogs.entity, entityId: auditLogs.entityId,
        data: auditLogs.data, createdAt: auditLogs.createdAt, user: sql<string | null>`${users.firstName} || ' ' || ${users.lastName}`,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(eq(auditLogs.companyId, ctx.company.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(100)
    return { items }
  })
}
