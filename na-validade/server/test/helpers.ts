import type { FastifyInstance } from 'fastify'
import { sql } from 'drizzle-orm'
import { buildApp } from '../src/app.ts'
import { db } from '../src/db/client.ts'
import { runMigrations } from '../src/db/migrate.ts'

export async function setup() {
  await runMigrations()
  await db.execute(sql`truncate table companies, external_product_cache restart identity cascade`)
  return buildApp()
}

// Minimal cookie-keeping client over fastify.inject.
export class Client {
  cookie = ''
  constructor(private app: FastifyInstance) {}

  async req(method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.inject({
      method,
      url,
      payload: body as object | undefined,
      headers: { cookie: this.cookie, 'x-requested-with': 'navalidade', ...headers },
    })
    const set = res.cookies.find((c) => c.name === 'nv_session')
    if (set) this.cookie = `nv_session=${set.value}`
    return { status: res.statusCode, body: res.body ? res.json() : null }
  }
  get = (url: string) => this.req('GET', url)
  post = (url: string, body: unknown = {}) => this.req('POST', url, body)
  patch = (url: string, body: unknown) => this.req('PATCH', url, body)
}

let seq = 0
// Valid, unique Brazilian identifiers for test users.
export function person(overrides: Record<string, unknown> = {}) {
  seq++
  const base = String(100000000 + seq * 7919).slice(0, 9)
  const d = base.split('').map(Number)
  const dv = (arr: number[]) => {
    const s = arr.reduce((acc, n, i) => acc + n * (arr.length + 1 - i), 0)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  const d1 = dv(d)
  const d2 = dv([...d, d1])
  return {
    firstName: 'Teste',
    lastName: `Usuario${seq}`,
    email: `teste${seq}@exemplo.com.br`,
    phone: `119${String(10000000 + seq).slice(-8)}`,
    document: `${base}${d1}${d2}`,
    jobTitle: 'Gerente',
    password: 'Senha-forte-123',
    ...overrides,
  }
}

// Valid, unique CNPJ (check digits per Receita Federal), used for account owners and stores.
let cnpjSeq = 0
export function cnpj() {
  cnpjSeq++
  const d = `${String(10000000 + cnpjSeq * 7919).slice(-8)}0001`.split('').map(Number)
  const dv = (arr: number[]) => {
    const w = arr.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const r = arr.reduce((acc, n, i) => acc + n * w[i], 0) % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = dv(d)
  return [...d, d1, dv([...d, d1])].join('')
}

// Account owner: signs up without CPF/CNPJ (the CNPJ belongs to each store).
export const owner = (overrides: Record<string, unknown> = {}) => person({ document: undefined, ...overrides })

// Store with all required fields (CNPJ, address, number and city).
export const storeData = (name: string, overrides: Record<string, unknown> = {}) => ({
  name, cnpj: cnpj(), address: 'Rua das Flores', addressNumber: '100', city: 'São Paulo', uf: 'SP', ...overrides,
})

export const isoInDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
