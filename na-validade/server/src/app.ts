import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyError } from 'fastify'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { authenticate, type AuthContext } from './auth/context.ts'
import { env } from './env.ts'
import { forbidden, HttpError } from './lib/http.ts'
import { adminRoutes } from './routes/admin.ts'
import { authPublicRoutes, meRoutes } from './routes/auth.ts'
import { dashboardRoutes } from './routes/dashboard.ts'
import { lotRoutes } from './routes/lots.ts'
import { notificationRoutes } from './routes/notifications.ts'
import { productRoutes } from './routes/products.ts'

const webDist = fileURLToPath(new URL('../../dist', import.meta.url))
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export async function buildApp({ logger = !env.isTest } = {}) {
  const app = Fastify({ logger, trustProxy: true, bodyLimit: 1_000_000 })
  app.decorateRequest('auth', null as unknown as AuthContext)

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
        mediaSrc: ["'self'", 'blob:'],
        // ViaCEP: the store form fills the address from the CEP straight from the browser.
        connectSrc: ["'self'", 'https://viacep.com.br'],
      },
    },
  })
  await app.register(cookie)
  await app.register(rateLimit, { max: env.isTest ? 10_000 : 300, timeWindow: '1 minute' })

  // CSRF protection: state-changing API calls must carry a custom header, which browsers only allow
  // cross-origin after a CORS preflight (and this API does not enable CORS). Cookies are also SameSite=Lax.
  app.addHook('onRequest', async (req) => {
    if (req.url.startsWith('/api/') && !SAFE_METHODS.has(req.method) && req.headers['x-requested-with'] !== 'navalidade')
      throw forbidden('Requisição bloqueada.')
  })

  app.setErrorHandler((err: FastifyError & { code?: string }, req, reply) => {
    if (err instanceof HttpError)
      return reply.status(err.statusCode).send({ error: err.code, message: err.message, details: err.details })
    if (err.statusCode === 429) return reply.status(429).send({ error: 'rate_limited', message: 'Muitas tentativas. Aguarde um minuto.' })
    if (err.code === '23505') return reply.status(409).send({ error: 'conflict', message: 'Registro duplicado.' })
    if (err.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: 'bad_request', message: 'Requisição inválida.' })
    req.log.error(err)
    return reply.status(500).send({ error: 'internal', message: 'Erro interno. Tente novamente.' })
  })

  app.get('/api/health', async () => ({ ok: true }))
  await app.register(authPublicRoutes)
  await app.register(async (api) => {
    api.addHook('preHandler', authenticate)
    await api.register(meRoutes)
    await api.register(adminRoutes)
    await api.register(productRoutes)
    await api.register(lotRoutes)
    await api.register(dashboardRoutes)
    await api.register(notificationRoutes)
  })

  // In production the API also serves the built web app (single origin, so the cookie stays first-party).
  if (existsSync(webDist) && !env.isTest) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false })
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/') ? reply.status(404).send({ error: 'not_found', message: 'Rota não encontrada.' }) : reply.sendFile('index.html'),
    )
  }
  return app
}
