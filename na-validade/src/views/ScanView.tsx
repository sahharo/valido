import { lazy, Suspense, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Camera, Check, Globe, Keyboard, LoaderCircle, Minus, PackagePlus, PackageX, Plus, Search, X } from 'lucide-react'
import { UNITS } from '../../shared/domain.ts'
import { barcodeError, onlyDigits } from '../../shared/validation.ts'
import { api, ApiError, patch, post } from '../api.ts'
import { CategoryIcon } from '../components/CategoryIcon.tsx'
import { LotCard, ProductThumb } from '../components/LotCard.tsx'
import { Chips, ErrorBox, Field, FormError, inputCls, Loading, PrimaryButton, secondaryBtn } from '../components/ui.tsx'
import { useOpenLot } from '../lotSheet.ts'
import { queryClient, refreshData, useCan } from '../queries.ts'
import { toast } from '../toast.ts'
import type { ExternalSuggestion, LotItem, ProductInfo, StoreInfo } from '../types.ts'
import { CATEGORIES, daysUntil, formatDate } from '../utils.ts'

// The camera reader (ZXing) is loaded only when the camera is opened, keeping the first load fast.
const Scanner = lazy(() => import('../components/Scanner.tsx').then((m) => ({ default: m.Scanner })))

// Scan flow: read barcode (camera or typed) -> internal catalog -> (register product) -> register lot.
export function ScanView({ stores, defaultStoreId }: { stores: StoreInfo[]; defaultStoreId: number | 'all' }) {
  const [code, setCode] = useState<string | null>(null)
  if (code) return <ProductFlow key={code} code={code} stores={stores} defaultStoreId={defaultStoreId} onDone={() => setCode(null)} />
  return <CodeEntry onCode={setCode} />
}

function CodeEntry({ onCode }: { onCode: (code: string) => void }) {
  const [scanning, setScanning] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')

  function submit(raw: string) {
    const code = onlyDigits(raw)
    setScanning(false)
    const err = barcodeError(code)
    if (err) return setError(raw.trim() && !code ? 'Este código não é um código de barras de produto (EAN/GTIN).' : err)
    setError('')
    onCode(code)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Escanear produto</h1>
        <p className="text-sm text-stone-500">Leia o código de barras (EAN) da embalagem ou digite os números.</p>
      </div>

      {scanning ? (
        <div className="space-y-3">
          <Suspense fallback={<Loading label="Abrindo câmera…" />}>
            <Scanner onDetected={submit} />
          </Suspense>
          <button onClick={() => setScanning(false)} className={secondaryBtn}>
            <X className="h-4 w-4" /> Fechar câmera
          </button>
        </div>
      ) : (
        <button
          onClick={() => setScanning(true)}
          className="flex w-full flex-col items-center gap-3 rounded-2xl bg-brand-500 p-8 text-white transition active:scale-[0.98]"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-white/20">
            <Camera className="h-8 w-8" />
          </span>
          <span className="text-lg font-semibold">Escanear com a câmera</span>
        </button>
      )}

      <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-stone-400">
        <span className="h-px flex-1 bg-stone-200" /> ou digite o código manualmente <span className="h-px flex-1 bg-stone-200" />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submit(typed) }} className="flex gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-xl bg-white px-4 py-3 ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-brand-400">
          <Keyboard className="h-5 w-5 text-stone-400" />
          <input
            value={typed}
            onChange={(e) => { setTyped(e.target.value); setError('') }}
            inputMode="numeric"
            placeholder="Ex.: 7894900011517"
            aria-label="Código de barras"
            className="w-full bg-transparent font-semibold tracking-wider outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-stone-400"
          />
        </label>
        <button className="grid w-14 place-items-center rounded-xl bg-stone-800 text-white transition active:scale-95" aria-label="Buscar">
          <Search className="h-5 w-5" />
        </button>
      </form>
      <FormError message={error} />
    </div>
  )
}

function FlowHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white ring-1 ring-stone-200" aria-label="Cancelar">
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}

type Found = { product: ProductInfo; lots: LotItem[] }

function ProductFlow({ code, stores, defaultStoreId, onDone }: { code: string; stores: StoreInfo[]; defaultStoreId: number | 'all'; onDone: () => void }) {
  const can = useCan()
  const [registering, setRegistering] = useState(false)
  const { data, error, refetch } = useQuery({ queryKey: ['product', code], queryFn: () => api<Found>(`/api/products/by-barcode/${code}`) })
  const notFound = error instanceof ApiError && error.code === 'product_not_found'
  // Not in the internal catalog: the public product database is queried right away, so the product
  // shows up as soon as the code is typed or scanned, without a "register product" step.
  const external = useQuery({
    queryKey: ['external', code],
    queryFn: () => api<{ suggestion: ExternalSuggestion }>(`/api/products/external/${code}`),
    enabled: notFound,
    retry: false,
  })

  if (data) return <LotForm found={data} stores={stores} defaultStoreId={defaultStoreId} onDone={onDone} />
  if (!error) return <Loading label="Buscando produto…" />
  if (!notFound) return <ErrorBox error={error} onRetry={refetch} />
  if (registering)
    return (
      <ProductForm
        code={code}
        onCancel={() => setRegistering(false)}
        onSaved={(product) => queryClient.setQueryData<Found>(['product', code], { product, lots: [] })}
      />
    )
  if (external.isPending) return <Loading label="Buscando na base pública de produtos…" />
  if (external.data)
    return (
      <LotForm
        found={{ product: previewProduct(code, external.data.suggestion), lots: [] }}
        suggestion={external.data.suggestion}
        onEditProduct={can('products:write') ? () => setRegistering(true) : undefined}
        stores={stores}
        defaultStoreId={defaultStoreId}
        onDone={onDone}
      />
    )

  const offline = external.error instanceof ApiError && external.error.code === 'external_unavailable'
  return (
    <div className="animate-pop space-y-5">
      <FlowHeader title="Escanear produto" onClose={onDone} />
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 text-center ring-1 ring-stone-200">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-amber-100 text-amber-600">
          <PackageX className="h-8 w-8" />
        </span>
        <p className="text-xl font-semibold">Produto não encontrado</p>
        <p className="text-sm text-stone-500">
          {offline
            ? 'A base pública de produtos não respondeu agora. Tente de novo em instantes ou cadastre os dados.'
            : <>O código <span className="font-mono font-bold">{code}</span> não está no app nem na base pública de produtos.</>}
        </p>
      </div>
      {offline && <button onClick={() => external.refetch()} className={secondaryBtn}>Tentar de novo</button>}
      {can('products:write') ? (
        <PrimaryButton onClick={() => setRegistering(true)}>
          <PackagePlus className="h-5 w-5" /> Cadastrar produto
        </PrimaryButton>
      ) : (
        <p className="rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          Peça a um gerente ou administrador para cadastrar este produto. Depois disso, você poderá registrar o lote.
        </p>
      )}
      <button onClick={onDone} className={secondaryBtn}>Escanear outro código</button>
    </div>
  )
}

// Product data shown before it is saved: it is only created in the catalog when the lot is saved.
function previewProduct(code: string, s: ExternalSuggestion): ProductInfo {
  return { id: 0, barcode: code, name: s.name, brand: s.brand, category: s.category ?? 'Outros', unit: 'un', imageUrl: s.imageUrl, costPrice: null }
}

type Remote = 'loading' | 'found' | 'notfound' | 'offline'

function ProductForm({ code, onCancel, onSaved }: { code: string; onCancel: () => void; onSaved: (p: ProductInfo) => void }) {
  const [f, setF] = useState({ name: '', brand: '', category: null as string | null, unit: 'un', costPrice: '' })
  const [suggestion, setSuggestion] = useState<ExternalSuggestion | null>(null)
  const [remote, setRemote] = useState<Remote>('loading')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))

  // External database is only a suggestion: it pre-fills the form and the user confirms or edits.
  useEffect(() => {
    let cancelled = false
    api<{ suggestion: ExternalSuggestion }>(`/api/products/external/${code}`)
      .then(({ suggestion: s }) => {
        if (cancelled) return
        setSuggestion(s)
        setF((p) => ({ ...p, name: p.name || s.name, brand: p.brand || (s.brand ?? ''), category: p.category ?? s.category }))
        setRemote('found')
      })
      .catch((e) => !cancelled && setRemote(e instanceof ApiError && e.code === 'external_not_found' ? 'notfound' : 'offline'))
    return () => {
      cancelled = true
    }
  }, [code])

  const cost = f.costPrice ? Number(f.costPrice.replace(',', '.')) : null
  const costInvalid = cost !== null && !(cost >= 0)
  const valid = f.name.trim().length >= 2 && f.category && !costInvalid

  async function save() {
    if (!valid) return
    setLoading(true)
    setError('')
    try {
      const { product } = await post<{ product: ProductInfo }>('/api/products', {
        barcode: code, name: f.name.trim(), brand: f.brand.trim() || null, category: f.category, unit: f.unit,
        costPrice: cost, imageUrl: suggestion?.imageUrl ?? null, source: suggestion ? 'external_api' : 'manual',
      })
      toast('Produto cadastrado')
      onSaved(product)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'product_exists') return void queryClient.invalidateQueries({ queryKey: ['product', code] })
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-pop space-y-5">
      <FlowHeader title="Cadastrar produto" onClose={onCancel} />
      <div className={`rounded-2xl p-4 ring-1 ${remote === 'found' ? 'bg-brand-50 ring-brand-100' : 'bg-amber-50 ring-amber-100'}`}>
        {remote === 'loading' && (
          <p className="flex items-center gap-2 text-sm font-semibold text-stone-600">
            <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" /> Procurando sugestões na base pública de produtos…
          </p>
        )}
        {remote === 'found' && suggestion && (
          <div className="flex items-center gap-3">
            {suggestion.imageUrl && <img src={suggestion.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl bg-white object-contain ring-1 ring-brand-100" />}
            <p className="text-sm font-semibold text-brand-800">
              Encontramos uma sugestão. Confira e corrija se precisar.
              <span className="mt-0.5 flex items-center gap-1 text-xs font-normal text-brand-700">
                <Globe className="h-3 w-3" /> Fonte: {suggestion.source}
              </span>
            </p>
          </div>
        )}
        {remote === 'notfound' && <p className="text-sm font-semibold text-amber-800">Não há sugestão para este código na base pública. Preencha os dados:</p>}
        {remote === 'offline' && <p className="text-sm font-semibold text-amber-800">A base pública de produtos não respondeu. Preencha os dados:</p>}
      </div>

      <div className="space-y-4">
        <Field label="Código de barras">
          <input className={`${inputCls} bg-stone-50 font-mono`} value={code} readOnly />
        </Field>
        <Field label="Nome do produto *">
          <input className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Leite Integral 1L" maxLength={200} />
        </Field>
        <Field label="Marca">
          <input className={inputCls} value={f.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Opcional" maxLength={100} />
        </Field>
        <div className="space-y-1.5">
          <span className="pl-1 text-sm font-bold text-stone-600">Setor *</span>
          <Chips options={CATEGORIES} value={f.category as (typeof CATEGORIES)[number] | null} onChange={(c) => set('category', c)} />
        </div>
        <div className="space-y-1.5">
          <span className="pl-1 text-sm font-bold text-stone-600">Unidade de controle</span>
          <Chips options={UNITS} value={f.unit as (typeof UNITS)[number]} onChange={(u) => set('unit', u)} />
        </div>
        <Field label="Preço de custo por unidade (R$)" hint="Opcional. Usado para calcular o valor das perdas." error={costInvalid ? 'Valor inválido' : undefined}>
          <input className={inputCls} inputMode="decimal" value={f.costPrice} onChange={(e) => set('costPrice', e.target.value)} placeholder="Ex.: 4,50" />
        </Field>
      </div>
      <FormError message={error} />
      <PrimaryButton loading={loading} disabled={!valid} onClick={save}>Salvar e cadastrar lote</PrimaryButton>
    </div>
  )
}

function LotForm({
  found, suggestion, onEditProduct, stores, defaultStoreId, onDone,
}: {
  found: Found
  suggestion?: ExternalSuggestion
  onEditProduct?: () => void
  stores: StoreInfo[]
  defaultStoreId: number | 'all'
  onDone: () => void
}) {
  const { product, lots } = found
  const can = useCan()
  const openLot = useOpenLot()
  // Several stores can be chosen: one lot is created in each, with the same quantity and expiry.
  const [storeIds, setStoreIds] = useState<number[]>([defaultStoreId === 'all' ? stores[0].id : defaultStoreId])
  const [category, setCategory] = useState<string | null>(suggestion ? suggestion.category : product.category)
  const [quantity, setQuantity] = useState('')
  const [expiry, setExpiry] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const q = quantity.trim() ? Number(quantity.replace(',', '.')) : null
  const days = expiry ? daysUntil(expiry) : null
  const valid = can('lots:write') && expiry && (q === null || q > 0) && storeIds.length > 0 && category
  // Blank quantity counts as 1, so the +/- buttons start from there.
  const step = (d: number) => setQuantity(String(Math.max(1, Math.round((q ?? 1) + d))))
  const allSelected = storeIds.length === stores.length
  const toggleStore = (id: number) => setStoreIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  async function save() {
    if (!valid) return
    setLoading(true)
    setError('')
    try {
      // Product found only in the public database: it is added to the catalog first.
      let productId = product.id
      if (suggestion)
        productId = (await post<{ product: ProductInfo }>('/api/products/import', { barcode: product.barcode, category: category ?? undefined })).product.id
      // The sector belongs to the product, so changing it here updates the product for all its lots.
      else if (category && category !== product.category) await patch(`/api/products/${product.id}`, { category })
      await post('/api/lots', {
        productId, storeIds, quantity: q ?? undefined, expiryDate: expiry, notes: notes.trim() || null,
      })
      toast(storeIds.length > 1 ? `Lote salvo em ${storeIds.length} lojas!` : 'Lote salvo!')
      await refreshData()
      queryClient.removeQueries({ queryKey: ['product', product.barcode] })
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-pop space-y-5">
      <FlowHeader title="Cadastrar lote" onClose={onDone} />
      <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <div className="flex items-center gap-3">
          {product.imageUrl ? <ProductThumb product={product} size="lg" /> : <CategoryIcon category={product.category} size="lg" />}
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Produto</p>
            <p className="text-lg font-semibold leading-tight">{product.name}</p>
            <p className="text-sm text-stone-500">{product.brand ?? product.category}</p>
            <p className="font-mono text-xs text-stone-400">Código: {product.barcode}</p>
          </div>
        </div>
        {suggestion && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800">
            <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> Encontrado em {suggestion.source}</span>
            {onEditProduct && <button onClick={onEditProduct} className="font-semibold underline">Corrigir dados</button>}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {suggestion || can('products:write') ? (
          <div className="space-y-1.5">
            <span className="pl-1 text-sm font-bold text-stone-600">Setor *</span>
            <Chips options={CATEGORIES} value={category as (typeof CATEGORIES)[number] | null} onChange={(c) => setCategory(c)} />
          </div>
        ) : (
          <p className="pl-1 text-sm font-bold text-stone-600">Setor: <span className="text-stone-800">{product.category}</span></p>
        )}
        {stores.length > 1 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between pl-1">
              <span className="text-sm font-bold text-stone-600">Lojas *</span>
              <button type="button" onClick={() => setStoreIds(allSelected ? [] : stores.map((s) => s.id))} className="text-xs font-semibold text-brand-600">
                {allSelected ? 'Limpar' : 'Selecionar todas'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {stores.map((s) => {
                const on = storeIds.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleStore(s.id)}
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold ring-1 transition active:scale-95 ${on ? 'bg-brand-500 text-white ring-brand-500' : 'bg-white text-stone-600 ring-stone-200'}`}
                  >
                    {on && <Check className="h-4 w-4" />} {s.name}
                  </button>
                )
              })}
            </div>
            <span className="block pl-1 text-xs text-stone-500">
              {storeIds.length > 1 ? `Será criado um lote em cada uma das ${storeIds.length} lojas, com a mesma quantidade e validade.` : 'Toque em mais lojas para cadastrar em todas de uma vez.'}
            </span>
          </div>
        ) : (
          <p className="pl-1 text-sm font-bold text-stone-600">Loja: <span className="text-stone-800">{stores[0].name}</span></p>
        )}
        <Field label={`Quantidade (${product.unit}) (opcional)`} hint={q === null ? 'Se deixar em branco, conta como 1.' : undefined}>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => step(-1)} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-stone-200 active:scale-95" aria-label="Diminuir">
              <Minus className="h-5 w-5" />
            </button>
            <input inputMode="decimal" className={`${inputCls} text-center text-lg`} value={quantity} placeholder="1" onChange={(e) => setQuantity(e.target.value)} />
            <button type="button" onClick={() => step(1)} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-stone-200 active:scale-95" aria-label="Aumentar">
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </Field>
        <Field
          label="Data de validade"
          error={days !== null && days < 0 ? 'Esta data já passou: o lote será registrado como vencido.' : undefined}
          hint={days !== null && days >= 0 ? `Vence em ${days} ${days === 1 ? 'dia' : 'dias'} (${formatDate(expiry)})` : undefined}
        >
          <input type="date" className={inputCls} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
        <Field label="Observações (opcional)">
          <textarea className={`${inputCls} min-h-16`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Ex.: embalagem amassada, gôndola 4" />
        </Field>
      </div>

      <FormError message={error} />
      <PrimaryButton loading={loading} disabled={!valid} onClick={save}>{storeIds.length > 1 ? `Salvar lote em ${storeIds.length} lojas` : 'Salvar lote'}</PrimaryButton>

      {lots.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="font-semibold text-stone-700">Lotes ativos deste produto</h2>
          <p className="text-xs text-stone-500">Em ordem de saída: o primeiro da lista vence antes.</p>
          {lots.map((l) => <LotCard key={l.id} lot={l} onOpen={() => openLot(l.id)} />)}
        </section>
      )}
    </div>
  )
}
