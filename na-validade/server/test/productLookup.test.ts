import { afterEach, describe, expect, it, vi } from 'vitest'
import { cosmosProvider, providers } from '../src/services/productLookup.ts'

// Product suggestions must be in Portuguese: names only known in another language are ignored.
const offResponse = (product: Record<string, unknown>) =>
  new Response(JSON.stringify({ status: 1, product }), { status: 200 })
const off = providers.find((p) => p.name === 'Open Food Facts')!
const signal = new AbortController().signal

afterEach(() => vi.unstubAllGlobals())

describe('busca externa só em português', () => {
  it('usa o nome em português quando existe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => offResponse({ lang: 'es', product_name: 'Coca-Cola Original', product_name_pt: 'Coca-Cola Original', quantity: '2 L' })))
    expect((await off.lookup('5449000000996', signal))?.name).toBe('Coca-Cola Original 2 L')
  })

  it('usa o nome principal quando o idioma do produto é português', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => offResponse({ lang: 'pt', product_name: 'União Refinado', product_name_pt: '' })))
    expect((await off.lookup('7891910000197', signal))?.name).toBe('União Refinado')
  })

  it('ignora produto que só tem nome em outro idioma', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => offResponse({ lang: 'en', product_name: 'Chocolate spread', product_name_pt: '' })))
    expect(await off.lookup('3017620422003', signal)).toBeNull()
  })

  it('Cosmos: lê descrição, marca e foto, enviando o token', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      description: 'REFRIGERANTE COCA-COLA PET 2L', brand: { name: 'COCA-COLA' }, thumbnail: 'https://cdn-cosmos.bluesoft.com.br/x.png',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const r = await cosmosProvider('tok').lookup('7894900011517', signal)
    expect(r).toMatchObject({ name: 'REFRIGERANTE COCA-COLA PET 2L', brand: 'COCA-COLA', category: 'Bebidas', unit: 'L', source: 'Cosmos' })
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ 'X-Cosmos-Token': 'tok' })
  })
})
