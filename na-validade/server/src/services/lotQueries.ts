import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
import { expiryStatus, MONTH_DAYS, WEEK_DAYS } from '../../../shared/status.ts'
import { inStores } from '../auth/context.ts'
import { db } from '../db/client.ts'
import { lots, products, stores } from '../db/schema.ts'

export const daysLeft = sql<number>`(${lots.expiryDate} - current_date)`.mapWith(Number)

const week = sql.raw(String(WEEK_DAYS))
const month = sql.raw(String(MONTH_DAYS))
export const bucket = {
  expired: sql`${lots.expiryDate} < current_date`,
  week: sql`${lots.expiryDate} between current_date and current_date + ${week}`,
  month: sql`${lots.expiryDate} between current_date + ${week} + 1 and current_date + ${month}`,
  ok: sql`${lots.expiryDate} > current_date + ${month}`,
}

export const lotView = {
  id: lots.id,
  lotNumber: lots.lotNumber,
  quantity: lots.quantity,
  initialQuantity: lots.initialQuantity,
  expiryDate: lots.expiryDate,
  unitCost: lots.unitCost,
  notes: lots.notes,
  status: lots.status,
  source: lots.source,
  createdAt: lots.createdAt,
  withdrawnAt: lots.withdrawnAt,
  withdrawalReason: lots.withdrawalReason,
  daysLeft,
  product: {
    id: products.id,
    barcode: products.barcode,
    name: products.name,
    brand: products.brand,
    category: products.category,
    unit: products.unit,
    imageUrl: products.imageUrl,
    costPrice: products.costPrice,
  },
  store: { id: stores.id, name: stores.name },
}

// FEFO (first expire, first out): earliest expiry first; on a tie, the larger quantity is more urgent.
export const fefoOrder = [asc(lots.expiryDate), desc(lots.quantity), asc(lots.id)]

export const activeLotsIn = (companyId: number, storeIds: number[]) =>
  and(eq(lots.companyId, companyId), eq(lots.status, 'active'), inStores(lots.storeId, storeIds))

export function selectLots(where: SQL | undefined) {
  return db
    .select(lotView)
    .from(lots)
    .innerJoin(products, eq(products.id, lots.productId))
    .innerJoin(stores, eq(stores.id, lots.storeId))
    .where(where)
}

export type LotRow = Awaited<ReturnType<typeof selectLots>>[number]
export const withExpiry = (r: LotRow) => ({ ...r, expiry: expiryStatus(r.daysLeft) })

const countIf = (cond: SQL) => sql<number>`count(*) filter (where ${cond})`.mapWith(Number)
const sumIf = (cond: SQL) => sql<number>`coalesce(sum(${lots.quantity}) filter (where ${cond}), 0)`.mapWith(Number)

// Active-lot counts per expiry bucket and store.
export async function expiryCountsByStore(companyId: number, storeIds: number[]) {
  return db
    .select({
      storeId: lots.storeId,
      expired: countIf(bucket.expired),
      week: countIf(bucket.week),
      month: countIf(bucket.month),
      ok: countIf(bucket.ok),
      expiredUnits: sumIf(bucket.expired),
      weekUnits: sumIf(bucket.week),
    })
    .from(lots)
    .where(activeLotsIn(companyId, storeIds))
    .groupBy(lots.storeId)
}
