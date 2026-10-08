import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { env } from '../env.ts'
import * as schema from './schema.ts'

// Session time zone makes CURRENT_DATE follow the stores' local day, which drives every expiry status.
export const pool = new pg.Pool({ connectionString: env.databaseUrl, options: `-c timezone=${env.timezone}` })
export const db = drizzle(pool, { schema })
export type DB = typeof db
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]
