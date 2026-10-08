import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Download, PackageSearch, Search, SlidersHorizontal } from 'lucide-react'
import { api, qs } from '../api.ts'
import { LotCard } from '../components/LotCard.tsx'
import { EmptyState, ErrorBox, inputCls, Loading } from '../components/ui.tsx'
import { useDebounced } from '../hooks.ts'
import { useOpenLot } from '../lotSheet.ts'
import { storeParam, useCan } from '../queries.ts'
import { toast } from '../toast.ts'
import type { LotItem } from '../types.ts'
import { CATEGORIES, downloadCsv, formatDate, formatDateTime } from '../utils.ts'

export type LotFilter = 'active' | 'expired' | 'week' | 'month' | 'ok' | 'withdrawn' | 'archived'

const FILTERS: { id: LotFilter; label: string; admin?: boolean }[] = [
  { id: 'active', label: 'Todos' },
  { id: 'expired', label: 'Vencidos' },
  { id: 'week', label: 'Até 7 dias' },
  { id: 'month', label: 'Até 30 dias' },
  { id: 'ok', label: 'Em dia' },
  { id: 'withdrawn', label: 'Retirados' },
  { id: 'archived', label: 'Arquivados', admin: true },
]

type Page = { items: LotItem[]; total: number }

// Lots list (FEFO order) with server-side search and filters.
export function LotsView({ storeId, filter, setFilter }: { storeId: number | 'all'; filter: LotFilter; setFilter: (f: LotFilter) => void }) {
  const can = useCan()
  const openLot = useOpenLot()
  const [q, setQ] = useState('')
  const term = useDebounced(q.trim())
  const [showFilters, setShowFilters] = useState(false)
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [limit, setLimit] = useState(50)
  const params = { storeId: storeParam(storeId), status: filter, category, q: term, expiryFrom: from, expiryTo: to }
  const { data, error, refetch, isFetching } = useQuery({
    queryKey: ['lots', params, limit],
    queryFn: () => api<Page>('/api/lots' + qs({ ...params, limit })),
    placeholderData: keepPreviousData,
  })
  const activeFilters = [category, from, to].filter(Boolean).length

  async function exportCsv() {
    const all: LotItem[] = []
    for (let offset = 0; ; offset += 200) {
      const page = await api<Page>('/api/lots' + qs({ ...params, limit: 200, offset }))
      all.push(...page.items)
      if (all.length >= page.total || !page.items.length) break
    }
    downloadCsv(
      `lotes-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Loja', 'Código', 'Produto', 'Marca', 'Categoria', 'Lote', 'Quantidade', 'Unidade', 'Validade', 'Dias restantes', 'Situação', 'Cadastrado em'],
      all.map((l) => [
        l.store.name, l.product.barcode, l.product.name, l.product.brand, l.product.category, l.lotNumber, l.quantity,
        l.product.unit, formatDate(l.expiryDate), l.daysLeft, l.status === 'active' ? l.expiry : l.status, formatDateTime(l.createdAt),
      ]),
    )
    toast(`${all.length} lotes exportados`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lotes</h1>
        <button onClick={exportCsv} className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-stone-600 ring-1 ring-stone-200">
          <Download className="h-4 w-4" /> Planilha
        </button>
      </div>
      <div className="flex gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-xl bg-white px-4 py-3 ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-brand-400">
          <Search className="h-5 w-5 shrink-0 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, código de barras ou nº do lote"
            className="w-full bg-transparent outline-none placeholder:text-stone-400"
            type="search"
          />
        </label>
        <button
          onClick={() => setShowFilters((s) => !s)}
          aria-expanded={showFilters}
          className={`relative grid w-14 place-items-center rounded-xl ring-1 ${showFilters ? 'bg-brand-500 text-white ring-brand-500' : 'bg-white text-stone-600 ring-stone-200'}`}
          aria-label="Filtros"
        >
          <SlidersHorizontal className="h-5 w-5" />
          {activeFilters > 0 && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[11px] font-semibold text-white">{activeFilters}</span>}
        </button>
      </div>

      {showFilters && (
        <div className="animate-pop space-y-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <label className="block space-y-1.5">
            <span className="pl-1 text-sm font-bold text-stone-600">Categoria</span>
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="pl-1 text-sm font-bold text-stone-600">Vence a partir de</span>
              <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="pl-1 text-sm font-bold text-stone-600">Vence até</span>
              <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          {activeFilters > 0 && (
            <button onClick={() => { setCategory(''); setFrom(''); setTo('') }} className="text-sm font-bold text-brand-600">
              Limpar filtros
            </button>
          )}
        </div>
      )}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.filter((f) => !f.admin || can('records:archive')).map((f) => (
          <button
            key={f.id}
            aria-pressed={filter === f.id}
            onClick={() => { setFilter(f.id); setLimit(50) }}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
              filter === f.id ? 'bg-brand-500 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorBox error={error} onRetry={refetch} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <p className="text-sm font-semibold text-stone-500">
            {data.total} {data.total === 1 ? 'lote' : 'lotes'}
            {['active', 'expired', 'week', 'month', 'ok'].includes(filter) && ' · ordem: o que vence primeiro'}
          </p>
          {data.items.length === 0 ? (
            <EmptyState icon={PackageSearch} title="Nenhum lote encontrado" />
          ) : (
            <div className={`space-y-2.5 ${isFetching ? 'opacity-70' : ''}`}>
              {data.items.map((l) => (
                <LotCard key={l.id} lot={l} onOpen={() => openLot(l.id)} onWithdraw={can('lots:withdraw') ? () => openLot(l.id, 'withdraw') : undefined} />
              ))}
            </div>
          )}
          {data.items.length < data.total && (
            <button onClick={() => setLimit((n) => n + 50)} className="w-full rounded-xl bg-white py-3 font-bold text-brand-700 ring-1 ring-stone-200">
              Carregar mais
            </button>
          )}
        </>
      )}
    </div>
  )
}
