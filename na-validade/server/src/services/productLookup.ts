import { eq } from 'drizzle-orm'
import { CATEGORIES, type Category } from '../../../shared/domain.ts'
import { db } from '../db/client.ts'
import { externalProductCache } from '../db/schema.ts'
import { env } from '../env.ts'

export interface ExternalProduct {
  name: string
  brand: string | null
  category: Category | null
  unit: string | null
  imageUrl: string | null
  source: string
}

// A source of product data by GTIN. New providers (e.g. GS1 Brasil/Cosmos, if licensed) implement this.
export interface ProductProvider {
  name: string
  lookup(barcode: string, signal: AbortSignal): Promise<ExternalProduct | null>
}

const CATEGORY_RULES: [RegExp, Category][] = [
  [/frozen|congelad|ice-cream|sorvete/, 'Congelados'],
  [/cheese|queijo|\bham\b|presunto|sausage|salsich|cold-cut|frios|charcut/, 'Frios'],
  [/dair|milk|leite|yogurt|iogurte|butter|manteiga|cream/, 'Laticínios'],
  [/bread|pao|paes|bakery|padaria|cake|bolo|biscuit|cookie|biscoito/, 'Padaria'],
  [/meat|carne|chicken|frango|beef|pork|fish|peixe/, 'Carnes'],
  [/beverage|drink|bebida|juice|suco|water|agua|soda|refri|refrigerante|beer|cerveja|wine|vinho|coffee|cafe/, 'Bebidas'],
  [/fruit|fruta|vegetable|legume|verdura|hortifruti/, 'Hortifruti'],
  [/hygiene|higiene|shampoo|soap|sabonete|toothpaste|creme-dental|deodorant|desodorante|cosmetic/, 'Higiene'],
  [/cleaning|limpeza|detergent|detergente|disinfect|desinfetante/, 'Limpeza'],
]

// Matches category tags plus the product name, lowercased and without accents ("pt:Bebida" -> "pt:bebida").
export function toCategory(tags: string[], name: string): Category | null {
  const all = [...tags, name].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return CATEGORY_RULES.find(([re]) => re.test(all))?.[1] ?? null
}

// "395 g" -> "g", "2 L" -> "L", "1kg" -> "kg".
function toUnit(quantity: string): string | null {
  const m = quantity.toLowerCase().match(/\d\s*(kg|g|ml|l)\b/)
  if (!m) return null
  return m[1] === 'l' ? 'L' : m[1]
}

const FIELDS = 'lang,product_name,product_name_pt,generic_name_pt,brands,quantity,categories_tags,image_front_small_url'

// Open Food Facts and its sister databases: open data (ODbL), free, no API key, rate-limited per IP.
function openFactsProvider(name: string, base: string, fallbackCategory?: Category): ProductProvider {
  return {
    name,
    async lookup(code, signal) {
      const res = await fetch(`${base}/api/v2/product/${encodeURIComponent(code)}.json?lc=pt&fields=${FIELDS}`, {
        signal,
        headers: { 'User-Agent': env.offUserAgent },
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`${name} HTTP ${res.status}`)
      const data = await res.json()
      const p = data.status === 1 ? data.product : null
      // Portuguese only: the main name is used only when the product's main language is Portuguese.
      // A product known only in another language is treated as not found, so the user types it once.
      const productName: string = (p?.product_name_pt || p?.generic_name_pt || (p?.lang === 'pt' ? p?.product_name : '') || '').trim()
      if (!productName) return null
      const qty: string = (p.quantity || '').trim()
      const fullName = qty && !productName.toLowerCase().includes(qty.toLowerCase()) ? `${productName} ${qty}` : productName
      const image: string = p.image_front_small_url || ''
      return {
        name: fullName.slice(0, 200),
        brand: (p.brands || '').split(',')[0].trim().slice(0, 100) || null,
        category: toCategory(p.categories_tags ?? [], productName) ?? fallbackCategory ?? null,
        unit: toUnit(qty),
        imageUrl: image.startsWith('https://') ? image : null,
        source: name,
      }
    },
  }
}

// Bluesoft Cosmos: Brazilian GTIN database with Portuguese descriptions. Needs a (free) token.
export function cosmosProvider(token: string): ProductProvider {
  return {
    name: 'Cosmos (Bluesoft)',
    async lookup(code, signal) {
      const res = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${encodeURIComponent(code)}.json`, {
        signal,
        headers: { 'X-Cosmos-Token': token, 'User-Agent': 'Cosmos-API-Request', 'Content-Type': 'application/json' },
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Cosmos HTTP ${res.status}`)
      const p = await res.json()
      const name: string = (p?.description || '').trim()
      if (!name) return null
      const image: string = p.thumbnail || ''
      return {
        name: name.slice(0, 200),
        brand: (p.brand?.name || '').trim().slice(0, 100) || null,
        category: toCategory([p.gpc?.description ?? '', p.ncm?.full_description ?? p.ncm?.description ?? ''], name),
        unit: toUnit(name),
        imageUrl: image.startsWith('https://') ? image : null,
        source: 'Cosmos',
      }
    },
  }
}

export const providers: ProductProvider[] = [
  ...(env.cosmosToken ? [cosmosProvider(env.cosmosToken)] : []),
  openFactsProvider('Open Food Facts', 'https://world.openfoodfacts.org'),
  openFactsProvider('Open Beauty Facts', 'https://world.openbeautyfacts.org', 'Higiene'),
  openFactsProvider('Open Products Facts', 'https://world.openproductsfacts.org'),
]

const FOUND_TTL_MS = 30 * 24 * 3600_000
const NOT_FOUND_TTL_MS = 24 * 3600_000

export class LookupUnavailableError extends Error {}

// Suggests product data for a barcode. Cached so repeated scans across companies do not hit the external API.
export async function lookupExternal(barcode: string, timeoutMs = 6000): Promise<ExternalProduct | null> {
  const [cached] = await db.select().from(externalProductCache).where(eq(externalProductCache.barcode, barcode))
  if (cached) {
    const age = Date.now() - cached.fetchedAt.getTime()
    if (age < (cached.found ? FOUND_TTL_MS : NOT_FOUND_TTL_MS)) return (cached.data as ExternalProduct | null) ?? null
  }
  const signal = AbortSignal.timeout(timeoutMs)
  let result: ExternalProduct | null = null
  let failures = 0
  for (const provider of providers) {
    try {
      result = await provider.lookup(barcode, signal)
    } catch {
      failures++
    }
    if (result) break
  }
  if (!result && failures === providers.length) throw new LookupUnavailableError()
  if (result && !CATEGORIES.includes(result.category as Category)) result.category = null
  await db
    .insert(externalProductCache)
    .values({ barcode, found: !!result, data: result, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: externalProductCache.barcode, set: { found: !!result, data: result, fetchedAt: new Date() } })
  return result
}
