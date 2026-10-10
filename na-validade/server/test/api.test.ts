import type { FastifyInstance } from 'fastify'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from '../src/db/client.ts'
import { sentMails } from '../src/lib/mail.ts'
import { Client, cnpj, isoInDays, owner, person, setup, storeData } from './helpers.ts'

let app: FastifyInstance
let admin: Client, manager: Client, employee: Client, outsider: Client
let storeA: number, storeB: number, otherStore: number
let productId: number
const EAN = '7894900011517'

async function signup(c: Client, company: string) {
  const res = await c.post('/api/auth/signup', { ...owner(), company, acceptTerms: true })
  expect(res.status).toBe(201)
  return res.body
}

beforeAll(async () => {
  app = await setup()
  admin = new Client(app)
  manager = new Client(app)
  employee = new Client(app)
  outsider = new Client(app)
})
afterAll(async () => {
  await app.close()
  await pool.end()
})

describe('autenticação', () => {
  it('cadastra a empresa e torna quem cadastrou administrador', async () => {
    const me = await signup(admin, 'Supermercados Teste')
    expect(me.user.role).toBe('admin')
    expect(me.permissions).toContain('users:manage')
    expect(me.stores).toEqual([])
  })

  it('valida os dados do cadastro no servidor', async () => {
    const c = new Client(app)
    const bad = await c.post('/api/auth/signup', { ...owner({ email: 'fulano@gmail' }), company: 'X Ltda', acceptTerms: true })
    expect(bad.status).toBe(400)
    expect(bad.body.message).toBe('E-mail inválido.')
    // No CNPJ at sign-up; an optional CPF must still be valid.
    const cpf = await c.post('/api/auth/signup', { ...owner({ document: '11111111111' }), company: 'X Ltda', acceptTerms: true })
    expect(cpf.body.message).toBe('CPF inválido.')
    // Password needs 8+ characters, an uppercase letter, a number and a special character.
    for (const password of ['Curta@1', 'semmaiuscula@1', 'SemNumero@', 'SemEspecial1']) {
      const r = await c.post('/api/auth/signup', { ...owner({ password }), acceptTerms: true })
      expect(r.body.message, password).toBe('A senha precisa ter pelo menos 8 caracteres, uma letra maiúscula, um número e um caractere especial.')
    }
    for (const phone of ['0000000', '11000000000', '11900000000', '00987654321', '1198765432', '1133333333']) {
      const r = await c.post('/api/auth/signup', { ...owner({ phone }), company: 'X Ltda', acceptTerms: true })
      expect(r.body.message, phone).toBe('Telefone inválido.')
    }
  })

  it('dono cria a conta sem CNPJ, entra só com e-mail e recusa senha errada', async () => {
    const p = owner()
    const c = new Client(app)
    expect((await c.post('/api/auth/signup', { ...p, company: 'Login Ltda', acceptTerms: true })).status).toBe(201)
    expect((await new Client(app).post('/api/auth/login', { identifier: p.email.toUpperCase(), password: p.password })).status).toBe(200)
    // Without a company name, the company starts with the owner's name and can be renamed.
    const noName = new Client(app)
    const q = owner()
    expect((await noName.post('/api/auth/signup', { ...q, acceptTerms: true })).body.company.name).toBe(`${q.firstName} ${q.lastName}`)
    expect((await noName.patch('/api/company', { name: 'Rede Nova' })).body.company.name).toBe('Rede Nova')
    // Phone, CPF and CNPJ are not logins.
    for (const identifier of [p.phone, cnpj(), person().document]) {
      expect((await new Client(app).post('/api/auth/login', { identifier, password: p.password })).status, identifier).toBe(400)
    }
    const wrong = await new Client(app).post('/api/auth/login', { identifier: p.email, password: 'errada-123' })
    expect(wrong.status).toBe(401)
  })

  it('bloqueia rotas sem sessão e requisições sem o cabeçalho anti-CSRF', async () => {
    expect((await new Client(app).get('/api/dashboard')).status).toBe(401)
    const res = await admin.req('POST', '/api/stores', { stores: [storeData('X')] }, { 'x-requested-with': '' })
    expect(res.status).toBe(403)
  })
})

describe('lojas, usuários e permissões', () => {
  it('loja exige CNPJ, endereço, número e cidade', async () => {
    for (const [field, message] of [
      ['cnpj', 'Informe o CNPJ da loja.'], ['address', 'Informe o endereço da loja.'],
      ['addressNumber', 'Informe o número do endereço da loja.'], ['city', 'Informe a cidade da loja.'],
    ]) {
      const res = await admin.post('/api/stores', { stores: [storeData('Incompleta', { [field]: undefined })] })
      expect(res.body.message, field).toBe(message)
    }
    expect((await admin.post('/api/stores', { stores: [storeData('Loja X', { cnpj: '11111111111111' })] })).body.message).toBe('CNPJ da loja inválido.')
    expect((await admin.post('/api/stores', { stores: [storeData('Loja X', { cep: '1234' })] })).body.message).toBe('CEP inválido.')
  })

  it('admin cadastra várias lojas de uma vez', async () => {
    const res = await admin.post('/api/stores', { stores: [storeData('Campo Belo', { uf: 'sp', cep: '04602-000' }), storeData('Pinheiros')] })
    expect(res.status).toBe(201)
    ;[storeA, storeB] = res.body.items.map((s: { id: number }) => s.id)
    expect(res.body.items[0].uf).toBe('SP')
    expect(res.body.items[0].addressNumber).toBe('100')
    expect(res.body.items[0].cep).toBe('04602000')
  })

  it('admin cria gerente e funcionário vinculados a uma loja', async () => {
    const m = person()
    const e = person()
    expect((await admin.post('/api/users', { ...m, role: 'manager', storeIds: [storeA] })).status).toBe(201)
    expect((await admin.post('/api/users', { ...e, role: 'employee', storeIds: [storeA] })).status).toBe(201)
    expect((await manager.post('/api/auth/login', { identifier: m.email, password: m.password })).status).toBe(200)
    expect((await employee.post('/api/auth/login', { identifier: e.email, password: e.password })).status).toBe(200)
    // CPF is not a login: team members use their e-mail.
    expect((await new Client(app).post('/api/auth/login', { identifier: e.document, password: e.password })).status).toBe(400)
    expect((await employee.get('/api/auth/me')).body.stores.map((s: { id: number }) => s.id)).toEqual([storeA])
  })

  it('gerente e funcionário não gerenciam lojas nem usuários', async () => {
    for (const c of [manager, employee]) {
      expect((await c.post('/api/stores', { stores: [storeData('Nova')] })).status).toBe(403)
      expect((await c.get('/api/users')).status).toBe(403)
      expect((await c.patch('/api/company', { settings: { employeesCanCreateProducts: true } })).status).toBe(403)
    }
  })

  it('funcionário não cadastra produto, a menos que o admin libere', async () => {
    const body = { barcode: '7891000100103', name: 'Leite Condensado 395 g', category: 'Mercearia' }
    expect((await employee.post('/api/products', body)).status).toBe(403)
    await admin.patch('/api/company', { settings: { employeesCanCreateProducts: true } })
    expect((await employee.post('/api/products', body)).status).toBe(201)
    await admin.patch('/api/company', { settings: { employeesCanCreateProducts: false } })
    expect((await employee.get('/api/auth/me')).body.permissions).not.toContain('products:write')
  })

  it('funcionário não vê relatórios nem a loja em que não trabalha', async () => {
    expect((await employee.get('/api/reports')).status).toBe(403)
    expect((await employee.get(`/api/dashboard?storeId=${storeB}`)).status).toBe(403)
  })

  it('admin edita os dados da equipe e cada um edita o próprio perfil', async () => {
    const emp = (await admin.get('/api/users')).body.items.find((u: { role: string }) => u.role === 'employee')
    const fixedEmail = `corrigido${Date.now()}@gmail.com`
    expect((await admin.patch(`/api/users/${emp.id}`, { firstName: 'Nome Certo', email: fixedEmail })).status).toBe(200)
    const me = (await employee.get('/api/auth/me')).body
    expect([me.user.firstName, me.user.email]).toEqual(['Nome Certo', fixedEmail])
    // Another account's e-mail is refused, both by the admin and on the own profile.
    const adminEmail = (await admin.get('/api/auth/me')).body.user.email
    expect((await admin.patch(`/api/users/${emp.id}`, { email: adminEmail })).status).toBe(409)
    expect((await employee.patch('/api/me', { email: adminEmail })).status).toBe(409)
    const own = await employee.patch('/api/me', { lastName: 'Sobrenome Certo' })
    expect(own.body.user.lastName).toBe('Sobrenome Certo')
    // Only admins edit other people.
    expect((await employee.patch(`/api/users/${emp.id}`, { firstName: 'Outro' })).status).toBe(403)
    await admin.patch(`/api/users/${emp.id}`, { firstName: emp.firstName, lastName: emp.lastName, email: emp.email })
  })

  it('admin não remove o próprio acesso', async () => {
    const me = (await admin.get('/api/auth/me')).body
    expect((await admin.patch(`/api/users/${me.user.id}`, { role: 'employee' })).status).toBe(400)
  })
})

describe('produtos e lotes', () => {
  it('rejeita código de barras com dígito verificador errado', async () => {
    const res = await manager.post('/api/products', { barcode: '7894900011518', name: 'Coca', category: 'Bebidas' })
    expect(res.status).toBe(400)
  })

  it('consulta o banco interno primeiro: produto não encontrado', async () => {
    const res = await employee.get(`/api/products/by-barcode/${EAN}`)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('product_not_found')
  })

  it('gerente cadastra produto; o código não se repete na empresa', async () => {
    const body = { barcode: EAN, name: 'Refrigerante Coca-Cola 2L', brand: 'Coca-Cola', category: 'Bebidas', unit: 'un', costPrice: 4.5 }
    const res = await manager.post('/api/products', body)
    expect(res.status).toBe(201)
    productId = res.body.product.id
    const dup = await manager.post('/api/products', body)
    expect(dup.status).toBe(409)
    expect(dup.body.details.id).toBe(productId)
  })

  it('funcionário cadastra lotes e eles aparecem em ordem FEFO', async () => {
    const mk = (days: number, qty: number, lotNumber: string) =>
      employee.post('/api/lots', { productId, storeId: storeA, lotNumber, quantity: qty, expiryDate: isoInDays(days) })
    expect((await mk(40, 35, 'B')).status).toBe(201)
    expect((await mk(4, 12, 'A')).status).toBe(201)
    expect((await mk(-2, 5, 'V')).status).toBe(201)
    expect((await mk(4, 20, 'A2')).status).toBe(201)
    const found = await employee.get(`/api/products/by-barcode/${EAN}`)
    expect(found.body.lots.map((l: { lotNumber: string }) => l.lotNumber)).toEqual(['V', 'A2', 'A', 'B'])
    expect(found.body.lots[0].expiry).toBe('expired')
  })

  it('não cadastra lote em loja sem acesso', async () => {
    const res = await employee.post('/api/lots', { productId, storeId: storeB, quantity: 1, expiryDate: isoInDays(10) })
    expect(res.status).toBe(403)
  })

  it('dashboard calcula os cards e a lista de atenção', async () => {
    const d = (await employee.get('/api/dashboard')).body
    expect(d.counts).toEqual({ expired: 1, week: 2, month: 0, ok: 1 })
    expect(d.attention.map((l: { lotNumber: string }) => l.lotNumber)).toEqual(['V', 'A2', 'A'])
    expect(d.upcoming[0].lotNumber).toBe('A2')
    expect(d.losses).toBeNull()
  })

  it('busca lotes por número do lote e filtra por status', async () => {
    expect((await employee.get('/api/lots?q=A2')).body.total).toBe(1)
    expect((await employee.get('/api/lots?status=expired')).body.items[0].lotNumber).toBe('V')
    expect((await employee.get('/api/lots?status=archived')).status).toBe(403)
  })
})

describe('retirada, histórico e perdas', () => {
  let expiredLot: number
  let partialLot: number

  it('retirada parcial mantém o lote ativo e registra o histórico', async () => {
    partialLot = (await employee.get('/api/lots?q=A2')).body.items[0].id
    const res = await employee.post(`/api/lots/${partialLot}/withdraw`, { quantity: 8, reason: 'damaged' })
    expect(res.status).toBe(200)
    expect(res.body.lot.quantity).toBe(12)
    expect(res.body.lot.status).toBe('active')
  })

  it('retirada total muda o status, guarda quem e o motivo, e calcula a perda', async () => {
    expiredLot = (await employee.get('/api/lots?status=expired')).body.items[0].id
    const res = await employee.post(`/api/lots/${expiredLot}/withdraw`, { reason: 'expired' })
    expect(res.body.lot.status).toBe('withdrawn')
    const detail = (await employee.get(`/api/lots/${expiredLot}`)).body
    expect(detail.movements.map((m: { type: string }) => m.type)).toEqual(['entry', 'withdrawal'])
    expect(detail.movements[1]).toMatchObject({ quantity: 5, reason: 'expired', totalCost: 22.5 })
    expect(detail.movements[1].user).toMatch(/^Teste /)
  })

  it('não retira mais do que existe, nem duas vezes', async () => {
    expect((await employee.post(`/api/lots/${partialLot}/withdraw`, { quantity: 99, reason: 'damaged' })).status).toBe(400)
    expect((await employee.post(`/api/lots/${expiredLot}/withdraw`, { reason: 'expired' })).status).toBe(409)
    expect((await employee.post(`/api/lots/${partialLot}/withdraw`, { quantity: 1, reason: 'other' })).status).toBe(400)
  })

  it('relatório soma perdas (devolução não conta como perda)', async () => {
    await manager.post(`/api/lots/${partialLot}/withdraw`, { quantity: 2, reason: 'returned' })
    const r = (await manager.get('/api/reports')).body
    expect(r.losses.total).toMatchObject({ count: 2, quantity: 13, value: 58.5 })
    expect(r.losses.byReason.map((x: { reason: string }) => x.reason).sort()).toEqual(['damaged', 'expired', 'returned'])
    expect(r.history).toHaveLength(3)
    const d = (await admin.get('/api/dashboard')).body
    expect(d.losses.total.value).toBe(58.5)
    expect(d.losses.expired.value).toBe(22.5)
  })

  it('promoção marca o lote e a venda em promoção conta como perda evitada', async () => {
    const on = await employee.post(`/api/lots/${partialLot}/promotion`, { discount: 30 })
    expect(on.status).toBe(200)
    expect(on.body.lot).toMatchObject({ promoDiscount: 30, quantity: 10, status: 'active' })
    expect(on.body.lot.promoSince).toBeTruthy()
    expect((await employee.post(`/api/lots/${partialLot}/promotion`, { discount: 95 })).status).toBe(400)
    await employee.post(`/api/lots/${partialLot}/withdraw`, { quantity: 1, reason: 'sold' })
    const r = (await manager.get('/api/reports')).body
    expect(r.losses.total.value).toBe(58.5)
    expect(r.avoided.quantity).toBe(3)
    expect(r.monthly).toHaveLength(6)
    const off = await employee.post(`/api/lots/${partialLot}/promotion`, { active: false })
    expect(off.body.lot.promoSince).toBeNull()
  })

  it('só admin arquiva; o lote sai das listas mas o histórico continua', async () => {
    const id = (await employee.get('/api/lots?q=B')).body.items.find((l: { lotNumber: string }) => l.lotNumber === 'B').id
    expect((await manager.post(`/api/lots/${id}/archive`, { notes: 'cadastro duplicado' })).status).toBe(403)
    expect((await admin.post(`/api/lots/${id}/archive`, { notes: 'cadastro duplicado' })).status).toBe(200)
    expect((await admin.get('/api/lots?status=archived')).body.total).toBe(1)
    expect((await admin.get('/api/dashboard')).body.counts.ok).toBe(0)
    expect((await admin.get(`/api/lots/${id}`)).body.movements.map((m: { type: string }) => m.type)).toEqual(['entry', 'archive'])
  })

  it('o banco recusa alterar ou apagar o histórico', async () => {
    const cause = (q: Promise<unknown>) => q.then(() => '', (e: Error) => String((e.cause as Error | undefined)?.message))
    expect(await cause(db.execute(sql`delete from lot_movements`))).toMatch(/append-only/)
    expect(await cause(db.execute(sql`update audit_logs set action = 'x'`))).toMatch(/append-only/)
  })

  it('gera notificações de vencimento uma vez por dia', async () => {
    await employee.post('/api/lots', { productId, storeId: storeA, lotNumber: 'C', quantity: 3, expiryDate: isoInDays(2) })
    const first = (await employee.get('/api/notifications')).body
    const again = (await employee.get('/api/notifications')).body
    expect(first.items.length).toBeGreaterThan(0)
    expect(again.items.length).toBe(first.items.length)
    await employee.post('/api/notifications/read', {})
    expect((await employee.get('/api/notifications')).body.unread).toBe(0)
  })
})

describe('isolamento entre empresas', () => {
  it('outra empresa não acessa lojas, produtos nem lotes da primeira', async () => {
    await signup(outsider, 'Concorrente Ltda')
    otherStore = (await outsider.post('/api/stores', { stores: [storeData('Loja Rival')] })).body.items[0].id
    const lot = (await admin.get('/api/lots')).body.items[0].id
    expect((await outsider.get(`/api/lots/${lot}`)).status).toBe(404)
    expect((await outsider.get(`/api/products/${productId}`)).status).toBe(404)
    expect((await outsider.get(`/api/products/by-barcode/${EAN}`)).status).toBe(404)
    expect((await outsider.post(`/api/lots/${lot}/withdraw`, { reason: 'expired' })).status).toBe(404)
    expect((await outsider.post('/api/lots', { productId, storeId: otherStore, quantity: 1, expiryDate: isoInDays(5) })).status).toBe(404)
    expect((await outsider.get(`/api/dashboard?storeId=${storeA}`)).status).toBe(403)
    expect((await outsider.get('/api/dashboard')).body.counts).toEqual({ expired: 0, week: 0, month: 0, ok: 0 })
    expect((await admin.post('/api/lots', { productId, storeId: otherStore, quantity: 1, expiryDate: isoInDays(5) })).status).toBe(403)
  })

  it('o mesmo código pode existir no catálogo de outra empresa', async () => {
    const res = await outsider.post('/api/products', { barcode: EAN, name: 'Coca 2L', category: 'Bebidas' })
    expect(res.status).toBe(201)
    expect(res.body.product.id).not.toBe(productId)
  })
})

describe('cadastro rápido de lotes', () => {
  const EXT = '7891000053508'

  it('importa o produto da base externa (cache), mesmo para funcionário', async () => {
    await db.execute(sql`insert into external_product_cache (barcode, found, data, fetched_at)
      values (${EXT}, true, ${JSON.stringify({ name: 'Achocolatado em pó 400 g', brand: 'Nescau', category: null, unit: 'g', imageUrl: null, source: 'Open Food Facts' })}::jsonb, now())`)
    const res = await employee.post('/api/products/import', { barcode: EXT, category: 'Mercearia' })
    expect(res.status).toBe(201)
    expect(res.body.product).toMatchObject({ name: 'Achocolatado em pó 400 g', category: 'Mercearia', unit: 'un', source: 'external_api' })
    const again = await employee.post('/api/products/import', { barcode: EXT })
    expect(again.body.product.id).toBe(res.body.product.id)
  })

  it('cadastra o mesmo lote em várias lojas de uma vez; quantidade é opcional', async () => {
    const product = (await admin.get(`/api/products/by-barcode/${EXT}`)).body.product
    const res = await admin.post('/api/lots', { productId: product.id, storeIds: [storeA, storeB], expiryDate: isoInDays(60) })
    expect(res.status).toBe(201)
    expect(res.body.lots.map((l: { store: { id: number } }) => l.store.id).sort()).toEqual([storeA, storeB].sort())
    expect(res.body.lots.every((l: { quantity: number }) => l.quantity === 1)).toBe(true)
  })

  it('não cadastra em nenhuma loja se uma delas não for permitida', async () => {
    const product = (await employee.get(`/api/products/by-barcode/${EXT}`)).body.product
    const before = (await admin.get(`/api/lots?productId=${product.id}`)).body.total
    const res = await employee.post('/api/lots', { productId: product.id, storeIds: [storeA, storeB], quantity: 2, expiryDate: isoInDays(30) })
    expect(res.status).toBe(403)
    expect((await admin.get(`/api/lots?productId=${product.id}`)).body.total).toBe(before)
  })
})

describe('esqueci a senha', () => {
  it('não revela se o e-mail existe', async () => {
    const before = sentMails.length
    const res = await new Client(app).post('/api/auth/forgot', { email: 'ninguem@exemplo.com.br' })
    expect(res.status).toBe(200)
    expect(sentMails.length).toBe(before)
  })

  it('o link troca a senha uma única vez e encerra as sessões abertas', async () => {
    const c = new Client(app)
    const p = owner()
    expect((await c.post('/api/auth/signup', { ...p, acceptTerms: true })).status).toBe(201)
    expect((await new Client(app).post('/api/auth/forgot', { email: p.email })).status).toBe(200)
    const mail = sentMails.at(-1)!
    expect(mail.to).toBe(p.email)
    const token = mail.text.match(/redefinir=([\w-]+)/)![1]

    const anon = new Client(app)
    expect((await anon.post('/api/auth/reset', { token, password: 'fraca' })).status).toBe(400)
    expect((await anon.post('/api/auth/reset', { token, password: 'Nova-senha-456' })).status).toBe(200)
    expect((await c.get('/api/auth/me')).status).toBe(401)
    expect((await anon.post('/api/auth/login', { identifier: p.email, password: p.password })).status).toBe(401)
    expect((await anon.post('/api/auth/login', { identifier: p.email, password: 'Nova-senha-456' })).status).toBe(200)
    expect((await anon.post('/api/auth/reset', { token, password: 'Outra-senha-789' })).status).toBe(400)
  })
})
