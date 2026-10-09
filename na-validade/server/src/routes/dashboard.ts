import { and, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requirePermission, storeScope } from '../auth/context.ts'
import { lots } from '../db/schema.ts'
import { badRequest, parse } from '../lib/http.ts'
import { isoDate, optionalId } from '../lib/schemas.ts'
import {
  avoidedLosses, hasCostPrices, lossesByCategory, lossesByProduct, lossesByStore, lossTotals, monthLosses, monthlyLosses, productsAtRisk, todayPriorities,
  withdrawalHistory, withdrawalsByReason,
} from '../services/insights.ts'
import { activeLotsIn, expiryCountsByStore, fefoOrder, selectLots, withExpiry } from '../services/lotQueries.ts'

async function validityByStore(companyId: number, stores: { id: number; name: string }[]) {
  const rows = await expiryCountsByStore(companyId, stores.map((s) => s.id))
  const byStore = stores.map((s) => {
    const r = rows.find((x) => x.storeId === s.id)
    return { storeId: s.id, name: s.name, expired: r?.expired ?? 0, week: r?.week ?? 0, month: r?.month ?? 0, ok: r?.ok ?? 0 }
  })
  const counts = byStore.reduce(
    (acc, s) => ({ expired: acc.expired + s.expired, week: acc.week + s.week, month: acc.month + s.month, ok: acc.ok + s.ok }),
    { expired: 0, week: 0, month: 0, ok: 0 },
  )
  return { counts, byStore }
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/api/dashboard', async (req) => {
    const ctx = req.auth
    const { storeId } = parse(z.object({ storeId: optionalId }), req.query)
    const scope = { companyId: ctx.company.id, storeIds: storeScope(ctx, storeId) }
    const [validity, attention, upcoming, losses] = await Promise.all([
      validityByStore(ctx.company.id, ctx.stores.filter((s) => scope.storeIds.includes(s.id))),
      todayPriorities(scope),
      selectLots(and(activeLotsIn(scope.companyId, scope.storeIds), sql`${lots.expiryDate} >= current_date`))
        .orderBy(...fefoOrder)
        .limit(15),
      ctx.permissions.has('reports:view') ? monthLosses(scope) : null,
    ])
    return { ...validity, attention, upcoming: upcoming.map(withExpiry), losses }
  })

  app.get('/api/reports', async (req) => {
    const ctx = req.auth
    requirePermission(ctx, 'reports:view')
    const q = parse(z.object({ storeId: optionalId, from: isoDate.optional(), to: isoDate.optional() }), req.query)
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    const period = { from: q.from ?? `${today.slice(0, 8)}01`, to: q.to ?? today }
    if (period.from > period.to) throw badRequest('A data inicial deve ser anterior à final.')
    const scope = { companyId: ctx.company.id, storeIds: storeScope(ctx, q.storeId) }
    const [total, byReason, byProduct, byCategory, byStore, history, atRisk, validity, avoided, monthly, hasCosts] = await Promise.all([
      lossTotals(scope, period),
      withdrawalsByReason(scope, period),
      lossesByProduct(scope, period),
      lossesByCategory(scope, period),
      lossesByStore(scope, period),
      withdrawalHistory(scope, period),
      productsAtRisk(scope),
      validityByStore(ctx.company.id, ctx.stores.filter((s) => scope.storeIds.includes(s.id))),
      avoidedLosses(scope, period),
      monthlyLosses(scope),
      hasCostPrices(ctx.company.id),
    ])
    return { period, losses: { total, byReason, byProduct, byCategory, byStore }, history, atRisk, validity, avoided, monthly, hasCosts }
  })
}
