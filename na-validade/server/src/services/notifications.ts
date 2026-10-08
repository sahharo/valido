import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { lots, notificationDeliveries, notifications, stores } from '../db/schema.ts'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// Creates today's expiry alerts per store (idempotent through dedupeKey). Channels other than in_app
// (push, e-mail, WhatsApp) can be added later by creating "pending" deliveries and a sender worker.
export async function generateExpiryAlerts(companyId?: number) {
  const rows = await db
    .select({
      companyId: lots.companyId,
      storeId: lots.storeId,
      store: stores.name,
      today: sql<string>`current_date::text`,
      expired: sql<number>`count(*) filter (where ${lots.expiryDate} < current_date)`.mapWith(Number),
      soon: sql<number>`count(*) filter (where ${lots.expiryDate} between current_date and current_date + 3)`.mapWith(Number),
    })
    .from(lots)
    .innerJoin(stores, eq(stores.id, lots.storeId))
    .where(and(eq(lots.status, 'active'), isNull(stores.archivedAt), companyId ? eq(lots.companyId, companyId) : undefined))
    .groupBy(lots.companyId, lots.storeId, stores.name)

  for (const r of rows) {
    const alerts = [
      r.expired > 0 && {
        type: 'expired', severity: 'critical' as const,
        title: `${plural(r.expired, 'lote vencido', 'lotes vencidos')} na ${r.store}`,
        body: 'Retire os produtos vencidos da prateleira e registre a retirada.',
      },
      r.soon > 0 && {
        type: 'expiring_soon', severity: 'warning' as const,
        title: `${plural(r.soon, 'lote vence', 'lotes vencem')} nos próximos 3 dias na ${r.store}`,
        body: 'Priorize esses produtos na exposição (primeiro que vence, primeiro que sai).',
      },
    ].filter((a) => !!a)
    for (const a of alerts) {
      const [n] = await db
        .insert(notifications)
        .values({ ...a, companyId: r.companyId, storeId: r.storeId, dedupeKey: `${a.type}:${r.storeId}:${r.today}` })
        .onConflictDoNothing()
        .returning({ id: notifications.id })
      if (n) await db.insert(notificationDeliveries).values({ notificationId: n.id, channel: 'in_app', status: 'sent', sentAt: new Date() })
    }
  }
}
