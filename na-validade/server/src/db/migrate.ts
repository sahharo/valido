import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import { db, pool } from './client.ts'

export const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

export async function runMigrations() {
  await migrate(db, { migrationsFolder })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runMigrations()
  await pool.end()
  console.log('Migrações aplicadas.')
}
