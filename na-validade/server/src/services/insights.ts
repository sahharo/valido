import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { LOSS_REASONS } from '../../../shared/domain.ts'
import { inStores } from '../auth/context.ts'
import { db } from '../db/client.ts'
import { lotMovements, lots, products, stores, users } from '../db/schema.ts'
import { activeLotsIn, fefoOrder, selectLots, withExpiry } from './lotQueries.ts'

// Deterministic, tenant-scoped queries over real data. Reports and the dashboard use them today; a future
// AI assistant must answer through these same functions (as tools) instead of generating numbers itself.

export interface Scope {
  companyId: number
  storeIds: number[]
}
export interface Period {
  from: string
  to: string
}

const num = (s: SQL) => sql<number>`coalesce(${s}, 0)`.mapWith(Number)
const lossValue = num(sql`sum(${lotMovements.totalCost})`)
const lossQty = num(sql`sum(${lotMovements.quantity})`)

function withdrawalsIn({ companyId, storeIds }: Scope, period: Period, onlyLosses = true) {
  return and(
    eq(lotMovements.companyId, companyId),
    inStores(lotMovements.storeId, storeIds),
    eq(lotMovements.type, 'withdrawal'),
    onlyLosses ? inArray(lotMovements.reason, [...LOSS_REASONS]) : undefined,
    sql`${lotMovements.createdAt} >= ${period.from}::date`,
    sql`${lotMovements.createdAt} < ${period.to}::date + 1`,
  )
}

export async function lossTotals(scope: Scope, period: Period) {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number), quantity: lossQty, value: lossValue })
    .from(lotMovements)
    .where(withdrawalsIn(scope, period))
  return row
}

// Losses since the first day of the current month, total and only by expiry.
export async function monthLosses(scope: Scope) {
  const [{ from, to }] = await db
    .select({ from: sql<string>`date_trunc('month', current_date)::date::text`, to: sql<string>`current_date::text` })
    .from(sql`(select 1) as t`)
  const [total, [expired]] = await Promise.all([
    lossTotals(scope, { from, to }),
    db
      .select({ quantity: lossQty, value: lossValue })
      .from(lotMovements)
      .where(and(withdrawalsIn(scope, { from, to }), eq(lotMovements.reason, 'expired'))),
  ])
  return { from, to, total, expired }
}

export function withdrawalsByReason(scope: Scope, period: Period) {
  return db
    .select({ reason: lotMovements.reason, count: sql<number>`count(*)`.mapWith(Number), quantity: lossQty, value: lossValue })
    .from(lotMovements)
    .where(withdrawalsIn(scope, period, false))
    .groupBy(lotMovements.reason)
    .orderBy(desc(lossValue))
}

export function lossesByProduct(scope: Scope, period: Period, limit = 10) {
  return db
    .select({ productId: products.id, name: products.name, category: products.category, quantity: lossQty, value: lossValue })
    .from(lotMovements)
    .innerJoin(products, eq(products.id, lotMovements.productId))
    .where(withdrawalsIn(scope, period))
    .groupBy(products.id)
    .orderBy(desc(lossValue), desc(lossQty))
    .limit(limit)
}

export function lossesByCategory(scope: Scope, period: Period) {
  return db
    .select({ category: products.category, quantity: lossQty, value: lossValue })
    .from(lotMovements)
    .innerJoin(products, eq(products.id, lotMovements.productId))
    .where(withdrawalsIn(scope, period))
    .groupBy(products.category)
    .orderBy(desc(lossValue), desc(lossQty))
}

export function lossesByStore(scope: Scope, period: Period) {
  return db
    .select({
      storeId: stores.id, name: stores.name, quantity: lossQty, value: lossValue,
      expiredCount: sql<number>`count(*) filter (where ${lotMovements.reason} = 'expired')`.mapWith(Number),
    })
    .from(lotMovements)
    .innerJoin(stores, eq(stores.id, lotMovements.storeId))
    .where(withdrawalsIn(scope, period))
    .groupBy(stores.id)
    .orderBy(desc(lossValue), desc(lossQty))
}

export function withdrawalHistory(scope: Scope, period: Period, limit = 300) {
  return db
    .select({
      id: lotMovements.id, createdAt: lotMovements.createdAt, reason: lotMovements.reason, quantity: lotMovements.quantity,
      totalCost: lotMovements.totalCost, notes: lotMovements.notes, lotId: lots.id, lotNumber: lots.lotNumber,
      expiryDate: lots.expiryDate, product: products.name, barcode: products.barcode, category: products.category,
      unit: products.unit, store: stores.name, user: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
    })
    .from(lotMovements)
    .innerJoin(lots, eq(lots.id, lotMovements.lotId))
    .innerJoin(products, eq(products.id, lotMovements.productId))
    .innerJoin(stores, eq(stores.id, lotMovements.storeId))
    .innerJoin(users, eq(users.id, lotMovements.userId))
    .where(withdrawalsIn(scope, period, false))
    .orderBy(desc(lotMovements.createdAt))
    .limit(limit)
}

// Products with the most money at risk among active lots expiring within `days` (already expired included).
export function productsAtRisk({ companyId, storeIds }: Scope, days = 7, limit = 10) {
  const value = num(sql`sum(${lots.quantity} * coalesce(${lots.unitCost}, ${products.costPrice}))`)
  return db
    .select({
      productId: products.id, name: products.name, category: products.category, unit: products.unit,
      lots: sql<number>`count(*)`.mapWith(Number), quantity: num(sql`sum(${lots.quantity})`), value,
      nextExpiry: sql<string>`min(${lots.expiryDate})`,
    })
    .from(lots)
    .innerJoin(products, eq(products.id, lots.productId))
    .where(and(activeLotsIn(companyId, storeIds), sql`${lots.expiryDate} <= current_date + ${sql.raw(String(Math.trunc(days)))}`))
    .groupBy(products.id)
    .orderBy(desc(value), sql`min(${lots.expiryDate})`)
    .limit(limit)
}

// What to handle first today: expired and soon-to-expire lots, FEFO order.
export async function todayPriorities({ companyId, storeIds }: Scope, limit = 8) {
  const rows = await selectLots(and(activeLotsIn(companyId, storeIds), sql`${lots.expiryDate} <= current_date + 7`))
    .orderBy(...fefoOrder)
    .limit(limit)
  return rows.map(withExpiry)
}
