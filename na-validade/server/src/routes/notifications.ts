import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { inStores, type AuthContext } from '../auth/context.ts'
import { db } from '../db/client.ts'
import { notificationReads, notifications } from '../db/schema.ts'
import { parse } from '../lib/http.ts'
import { generateExpiryAlerts } from '../services/notifications.ts'

const visibleTo = (ctx: AuthContext) =>
  and(
    eq(notifications.companyId, ctx.company.id),
    or(isNull(notifications.storeId), inStores(notifications.storeId, ctx.storeIds)),
    gt(notifications.createdAt, sql`now() - interval '30 days'`),
  )

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/api/notifications', async (req) => {
    const ctx = req.auth
    await generateExpiryAlerts(ctx.company.id)
    const items = await db
      .select({
        id: notifications.id, type: notifications.type, severity: notifications.severity, title: notifications.title,
        body: notifications.body, storeId: notifications.storeId, createdAt: notifications.createdAt,
        read: sql<boolean>`${notificationReads.userId} is not null`,
      })
      .from(notifications)
      .leftJoin(notificationReads, and(eq(notificationReads.notificationId, notifications.id), eq(notificationReads.userId, ctx.user.id)))
      .where(visibleTo(ctx))
      .orderBy(desc(notifications.createdAt))
      .limit(50)
    return { items, unread: items.filter((n) => !n.read).length }
  })

  app.post('/api/notifications/read', async (req) => {
    const ctx = req.auth
    const { ids } = parse(z.object({ ids: z.array(z.number().int().positive()).max(200).optional() }), req.body ?? {})
    const visible = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(visibleTo(ctx), ids ? inArray(notifications.id, ids.length ? ids : [-1]) : undefined))
    if (visible.length)
      await db
        .insert(notificationReads)
        .values(visible.map((n) => ({ notificationId: n.id, userId: ctx.user.id })))
        .onConflictDoNothing()
    return { ok: true }
  })
}
