import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { ROLE_PERMISSIONS, type Permission } from '../../../shared/domain.ts'
import { db } from '../db/client.ts'
import { companies, stores, users, userStores } from '../db/schema.ts'
import { forbidden, unauthorized } from '../lib/http.ts'
import { resolveSession, SESSION_COOKIE } from './session.ts'

export type AuthUser = typeof users.$inferSelect
export type Company = typeof companies.$inferSelect

export interface AuthContext {
  user: AuthUser
  company: Company
  permissions: Set<Permission>
  // Active stores this user may access. Every data query is scoped by companyId AND these ids.
  storeIds: number[]
  stores: { id: number; name: string; cnpj: string | null; city: string | null; uf: string | null; address: string | null }[]
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext
  }
}

export function permissionsFor(user: AuthUser, company: Company) {
  const perms = new Set<Permission>(ROLE_PERMISSIONS[user.role])
  if (user.role === 'employee' && company.settings.employeesCanCreateProducts) perms.add('products:write')
  return perms
}

export async function loadContext(userId: number): Promise<AuthContext | null> {
  const [row] = await db
    .select({ user: users, company: companies })
    .from(users)
    .innerJoin(companies, eq(companies.id, users.companyId))
    .where(and(eq(users.id, userId), eq(users.active, true)))
  if (!row) return null
  const { user, company } = row
  const storeCols = { id: stores.id, name: stores.name, cnpj: stores.cnpj, city: stores.city, uf: stores.uf, address: stores.address, addressNumber: stores.addressNumber }
  const active = and(eq(stores.companyId, company.id), isNull(stores.archivedAt))
  const accessible =
    user.role === 'admin'
      ? await db.select(storeCols).from(stores).where(active).orderBy(asc(stores.name))
      : await db
          .select(storeCols)
          .from(stores)
          .innerJoin(userStores, eq(userStores.storeId, stores.id))
          .where(and(active, eq(userStores.userId, user.id)))
          .orderBy(asc(stores.name))
  return { user, company, permissions: permissionsFor(user, company), storeIds: accessible.map((s) => s.id), stores: accessible }
}

export async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE]
  const userId = token ? await resolveSession(token) : null
  const ctx = userId ? await loadContext(userId) : null
  if (!ctx) throw unauthorized()
  req.auth = ctx
}

export function requirePermission(ctx: AuthContext, permission: Permission) {
  if (!ctx.permissions.has(permission)) throw forbidden()
}

export function assertStoreAccess(ctx: AuthContext, storeId: number) {
  // Same response for "does not exist" and "not yours", so ids of other companies cannot be probed.
  if (!ctx.storeIds.includes(storeId)) throw forbidden('Você não tem acesso a esta loja.')
}

// Stores a query must be limited to: one requested store (after checking access) or every accessible store.
export function storeScope(ctx: AuthContext, storeId?: number) {
  if (storeId === undefined) return ctx.storeIds
  assertStoreAccess(ctx, storeId)
  return [storeId]
}

export const inStores = (column: Parameters<typeof inArray>[0], ids: number[]) => inArray(column, ids.length ? ids : [-1])
