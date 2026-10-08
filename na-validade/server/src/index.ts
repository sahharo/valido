import { buildApp } from './app.ts'
import { purgeExpiredSessions } from './auth/session.ts'
import { runMigrations } from './db/migrate.ts'
import { env } from './env.ts'
import { generateExpiryAlerts } from './services/notifications.ts'

await runMigrations()
const app = await buildApp()
await app.listen({ port: env.port, host: '0.0.0.0' })

async function hourlyJobs() {
  try {
    await generateExpiryAlerts()
    await purgeExpiredSessions()
  } catch (err) {
    app.log.error(err, 'scheduled job failed')
  }
}
void hourlyJobs()
setInterval(hourlyJobs, 3600_000).unref()
