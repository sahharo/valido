import { and, eq, ne, or } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { JOB_TITLES } from '../../../shared/domain.ts'
import { isStrongPassword, isValidCPF, isValidEmail, isValidPhone, onlyDigits, PASSWORD_ERROR } from '../../../shared/validation.ts'
import type { AuthContext } from '../auth/context.ts'
import { loadContext } from '../auth/context.ts'
import { hashPassword, verifyPassword } from '../auth/password.ts'
import { createSession, destroySession, destroyUserSessions, SESSION_COOKIE, SESSION_TTL_MS } from '../auth/session.ts'
import { db } from '../db/client.ts'
import { companies, users } from '../db/schema.ts'
import { env } from '../env.ts'
import { audit } from '../lib/audit.ts'
import { badRequest, conflict, HttpError, parse } from '../lib/http.ts'

export const personFields = {
  firstName: z.string().trim().min(2, 'Informe o nome.').max(60),
  lastName: z.string().trim().min(2, 'Informe o sobrenome.').max(80),
  email: z.string().trim().toLowerCase().refine(isValidEmail, 'E-mail inválido.'),
  phone: z.string().transform(onlyDigits).refine(isValidPhone, 'Telefone inválido.'),
  // CPF is optional (login is by e-mail); when given it must be valid.
  document: z
    .string()
    .optional()
    .nullable()
    .transform((v) => onlyDigits(v ?? '') || null)
    .refine((v) => !v || isValidCPF(v), 'CPF inválido.'),
  jobTitle: z.enum(JOB_TITLES, 'Escolha o cargo.'),
}
// New passwords must be strong; login still accepts older passwords created before this rule.
export const passwordField = z.string().max(200).refine(isStrongPassword, PASSWORD_ERROR)

const signupSchema = z.object({
  // The account owner no longer gives a CNPJ: each store's CNPJ is asked when the store is created.
  ...personFields,
  // Company name is no longer asked at sign-up: it defaults to the owner's name and can be renamed in Ajustes.
  company: z.string().trim().max(120).optional(),
  password: passwordField,
  acceptTerms: z.literal(true, 'É preciso aceitar os termos de uso e a política de privacidade.'),
})

const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Informe seu e-mail.').max(254),
  password: z.string().min(1, 'Informe a senha.').max(200),
})

export async function assertIdentifiersFree(data: { email: string; phone: string; document?: string | null }) {
  const taken = await db
    .select({ email: users.email, phone: users.phone, document: users.document })
    .from(users)
    .where(or(eq(users.email, data.email), eq(users.phone, data.phone), data.document ? eq(users.document, data.document) : undefined))
  if (taken.some((u) => u.email === data.email)) throw conflict('Já existe uma conta com este e-mail.')
  if (taken.some((u) => u.phone === data.phone)) throw conflict('Já existe uma conta com este telefone.')
  if (taken.length) throw conflict('Já existe uma conta com este CPF.')
}

// When editing a person, the new e-mail/phone must not belong to another account.
export async function assertContactFree(userId: number, data: { email?: string; phone?: string }) {
  for (const [field, value, msg] of [
    ['email', data.email, 'Já existe uma conta com este e-mail.'],
    ['phone', data.phone, 'Já existe uma conta com este telefone.'],
  ] as const) {
    if (!value) continue
    const [other] = await db.select({ id: users.id }).from(users).where(and(eq(users[field], value), ne(users.id, userId)))
    if (other) throw conflict(msg)
  }
}

export function serializeMe(ctx: AuthContext) {
  const { user, company } = ctx
  return {
    user: {
      id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone,
      document: user.document, documentType: user.documentType, jobTitle: user.jobTitle, role: user.role,
      createdAt: user.createdAt,
    },
    company: { id: company.id, name: company.name, settings: company.settings },
    permissions: [...ctx.permissions],
    stores: ctx.stores,
  }
}

function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

const authLimit = { rateLimit: { max: env.isTest ? 1000 : 10, timeWindow: '1 minute' } }

export async function authPublicRoutes(app: FastifyInstance) {
  app.post('/api/auth/signup', { config: authLimit }, async (req, reply) => {
    const data = parse(signupSchema, req.body)
    await assertIdentifiersFree(data)
    const passwordHash = await hashPassword(data.password)
    const user = await db.transaction(async (tx) => {
      const [company] = await tx.insert(companies).values({ name: data.company || `${data.firstName} ${data.lastName}` }).returning()
      const [u] = await tx
        .insert(users)
        .values({
          companyId: company.id, firstName: data.firstName, lastName: data.lastName, email: data.email,
          phone: data.phone, document: data.document, documentType: data.document ? 'cpf' : null,
          jobTitle: data.jobTitle, role: 'admin', passwordHash,
        })
        .returning()
      await audit(req, 'signup', 'user', u.id, { company: company.name }, tx, { companyId: company.id, userId: u.id })
      return u
    })
    setSessionCookie(reply, await createSession(user.id, req.headers['user-agent']))
    return reply.status(201).send(serializeMe((await loadContext(user.id))!))
  })

  app.post('/api/auth/login', { config: authLimit }, async (req, reply) => {
    const { identifier, password } = parse(loginSchema, req.body)
    // Everyone (owner and team) logs in with e-mail only. CPF, CNPJ and phone are not logins.
    if (!identifier.includes('@')) throw badRequest('Entre com o seu e-mail.')
    const candidates = await db.select().from(users).where(eq(users.email, identifier.toLowerCase())).limit(1)

    let user: (typeof candidates)[number] | undefined
    for (const c of candidates) if (await verifyPassword(c.passwordHash, password)) user = c
    if (!candidates.length) await verifyPassword(undefined, password)
    if (!user) {
      if (candidates[0]) await audit(req, 'login_failed', 'user', candidates[0].id, undefined, db, { companyId: candidates[0].companyId, userId: candidates[0].id })
      throw new HttpError(401, 'Login ou senha incorretos.', 'invalid_credentials')
    }
    if (!user.active) throw new HttpError(403, 'Sua conta está desativada. Fale com o administrador.', 'inactive')

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))
    await audit(req, 'login', 'user', user.id, undefined, db, { companyId: user.companyId, userId: user.id })
    setSessionCookie(reply, await createSession(user.id, req.headers['user-agent']))
    return serializeMe((await loadContext(user.id))!)
  })

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE]
    if (token) await destroySession(token)
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })
}

const profileSchema = z.object({
  firstName: personFields.firstName,
  lastName: personFields.lastName,
  email: personFields.email,
  phone: personFields.phone,
  jobTitle: personFields.jobTitle,
}).partial()

export async function meRoutes(app: FastifyInstance) {
  app.get('/api/auth/me', async (req) => serializeMe(req.auth))

  app.patch('/api/me', async (req) => {
    const data = parse(profileSchema, req.body)
    await assertContactFree(req.auth.user.id, data)
    await db.update(users).set(data).where(eq(users.id, req.auth.user.id))
    await audit(req, 'profile_update', 'user', req.auth.user.id, data)
    return serializeMe((await loadContext(req.auth.user.id))!)
  })

  app.post('/api/me/password', async (req) => {
    const { currentPassword, newPassword } = parse(
      z.object({ currentPassword: z.string().min(1, 'Informe a senha atual.'), newPassword: passwordField }),
      req.body,
    )
    if (!(await verifyPassword(req.auth.user.passwordHash, currentPassword))) throw badRequest('Senha atual incorreta.')
    await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, req.auth.user.id))
    await destroyUserSessions(req.auth.user.id, req.cookies[SESSION_COOKIE])
    await audit(req, 'password_change', 'user', req.auth.user.id)
    return { ok: true }
  })
}
