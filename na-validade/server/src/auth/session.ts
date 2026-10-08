import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, lt, ne } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { sessions } from '../db/schema.ts'

export const SESSION_COOKIE = 'nv_session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const RENEW_BEFORE_MS = 15 * 24 * 60 * 60 * 1000

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function createSession(userId: number, userAgent?: string) {
  const token = randomBytes(32).toString('base64url')
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    userAgent: userAgent?.slice(0, 300),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  })
  return token
}

// Returns the user id of a valid session, extending sessions that are close to expiring.
export async function resolveSession(token: string) {
  const id = hashToken(token)
  const [s] = await db.select().from(sessions).where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
  if (!s) return null
  if (s.expiresAt.getTime() - Date.now() < RENEW_BEFORE_MS) {
    await db.update(sessions).set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) }).where(eq(sessions.id, id))
  }
  return s.userId
}

export const destroySession = (token: string) => db.delete(sessions).where(eq(sessions.id, hashToken(token)))

export const destroyUserSessions = (userId: number, exceptToken?: string) =>
  db.delete(sessions).where(
    exceptToken ? and(eq(sessions.userId, userId), ne(sessions.id, hashToken(exceptToken))) : eq(sessions.userId, userId),
  )

export const purgeExpiredSessions = () => db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
