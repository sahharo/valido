import type { FastifyRequest } from 'fastify'
import { db, type Tx } from '../db/client.ts'
import { auditLogs } from '../db/schema.ts'

export async function audit(
  req: FastifyRequest,
  action: string,
  entity: string,
  entityId?: number | null,
  data?: Record<string, unknown>,
  tx: Tx | typeof db = db,
  actor?: { companyId: number; userId: number },
) {
  await tx.insert(auditLogs).values({
    companyId: actor?.companyId ?? req.auth?.company.id,
    userId: actor?.userId ?? req.auth?.user.id,
    action,
    entity,
    entityId: entityId ?? null,
    data: data ?? null,
    ip: req.ip,
  })
}
