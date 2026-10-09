import { ChevronRight, CircleCheck } from 'lucide-react'
import { PromoBadge } from '../components/LotCard.tsx'
import { EmptyState, ErrorBox, Loading } from '../components/ui.tsx'
import { useOpenLot } from '../lotSheet.ts'
import { storeParam, useApi } from '../queries.ts'
import type { DashboardData, LotItem } from '../types.ts'
import { formatMoney, formatQty } from '../utils.ts'
import type { LotFilter } from './LotsView.tsx'

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function summary(c: DashboardData['counts']) {
  const total = c.expired + c.week + c.month + c.ok
  if (c.expired > 0)
    return {
      title: plural(c.expired, 'lote vencido', 'lotes vencidos'),
      text: c.week > 0 ? `E mais ${plural(c.week, 'lote vence', 'lotes vencem')} esta semana.` : 'Retire os vencidos das prateleiras.',
    }
  if (c.week > 0) return { title: plural(c.week, 'lote vence', 'lotes vencem') + ' esta semana', text: 'Nenhum produto vencido. Fique de olho nos próximos dias.' }
  if (total === 0) return { title: 'Tudo em dia', text: 'Escaneie os lotes que chegam para começar a acompanhar.' }
  return { title: 'Tudo em dia', text: 'Nenhum produto vencido. Tudo sob controle.' }
}

function deadlineText(days: number) {
  if (days < -1) return `Venceu há ${-days} dias`
  if (days === -1) return 'Venceu ontem'
  if (days === 0) return 'Vence hoje'
  if (days === 1) return 'Vence amanhã'
  return `Vence em ${days} dias`
}

// Home screen: navy summary, lots that need action now and this month's losses.
export function Dashboard({ storeId, onOpenFilter }: { storeId: number | 'all'; onOpenFilter: (f: LotFilter) => void }) {
  const openLot = useOpenLot()
  const { data, error, refetch } = useApi<DashboardData>(['dashboard'], '/api/dashboard', { storeId: storeParam(storeId) })
  if (error) return <ErrorBox error={error} onRetry={refetch} />
  if (!data) return <Loading />

  const { counts } = data
  const s = summary(counts)
  const metrics = [
    { f: 'expired' as const, label: 'Vencidos', value: counts.expired },
    { f: 'week' as const, label: 'Até 7 dias', value: counts.week },
    { f: 'month' as const, label: 'Até 30 dias', value: counts.month },
    { f: 'ok' as const, label: 'Em dia', value: counts.ok },
  ]
  const lossMonth = data.losses && new Date(`${data.losses.from}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' })

  return (
    <div className="space-y-6">
      {/* Summary card stays navy in both themes. */}
      <div className="rounded-2xl bg-navy p-5 text-white">
        <p className="text-xs font-bold text-peach">Resumo de hoje</p>
        <p className="mt-1.5 text-2xl font-extrabold leading-tight">{s.title}</p>
        <p className="mt-1 text-sm text-[#B9C4D6]">{s.text}</p>
        <div className="mt-4 grid grid-cols-4 gap-1 border-t border-[#2C4268] pt-3">
          {metrics.map(({ f, label, value }) => (
            <button key={f} onClick={() => onOpenFilter(f)} className="min-w-0 rounded-lg py-1 text-left transition active:bg-white/5">
              <p className={`text-xl font-extrabold tabular-nums ${value === 0 ? 'text-[#6F82A3]' : f === 'expired' ? 'text-[#FF7A6B]' : 'text-peach'}`}>{value}</p>
              <p className="truncate text-[11px] font-semibold text-[#B9C4D6]">{label}</p>
            </button>
          ))}
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-ink">Precisa de atenção</h2>
          <button onClick={() => onOpenFilter('active')} className="flex items-center text-sm font-bold text-brand">
            Ver lotes <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {data.attention.length === 0 ? (
          <EmptyState icon={CircleCheck} title="Nada vencido ou vencendo nesta semana" text="Continue escaneando os lotes que chegam nas lojas." />
        ) : (
          <div className="space-y-2.5">
            {data.attention.map((l) => (
              <AttentionCard key={l.id} lot={l} onOpen={() => openLot(l.id)} onPromo={() => openLot(l.id, 'promo')} onWithdraw={() => openLot(l.id, 'withdraw')} />
            ))}
          </div>
        )}
      </section>

      {data.losses && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 text-sm">
          <span className="font-semibold text-ink-2">Perdas em {lossMonth}</span>
          <span className={`font-extrabold ${data.losses.total.value > 0 ? 'text-ink' : 'text-ink-3'}`}>{formatMoney(data.losses.total.value)}</span>
        </div>
      )}
    </div>
  )
}

function AttentionCard({ lot, onOpen, onPromo, onWithdraw }: { lot: LotItem; onOpen: () => void; onPromo: () => void; onWithdraw: () => void }) {
  const expired = lot.daysLeft < 0
  const tone = expired ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning'
  return (
    <div className="rounded-2xl bg-card p-3.5 ring-1 ring-line">
      <button onClick={onOpen} className="flex w-full items-center gap-3 text-left">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-center leading-none ${tone}`}>
          <span>
            <span className="block text-lg font-extrabold">{lot.expiryDate.slice(8, 10)}</span>
            <span className="block text-[10px] font-bold">{MONTHS[Number(lot.expiryDate.slice(5, 7)) - 1]}</span>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold text-ink">{lot.product.name}</p>
          <p className="truncate text-sm text-ink-2">
            <span className={`font-bold ${expired ? 'text-danger' : 'text-warning'}`}>{deadlineText(lot.daysLeft)}</span>
            {' · '}{lot.store.name} · {formatQty(lot.quantity, lot.product.unit)}
          </p>
          {lot.promoSince && <span className="mt-1 flex"><PromoBadge lot={lot} /></span>}
        </div>
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={onPromo} className="h-11 rounded-xl bg-accent text-sm font-bold text-on-accent transition active:scale-[0.98]">
          {lot.promoSince ? 'Em promoção' : 'Promoção'}
        </button>
        <button onClick={onWithdraw} className="h-11 rounded-xl bg-navy text-sm font-bold text-white transition active:scale-[0.98] dark:ring-1 dark:ring-[#2C4268]">
          Retirar
        </button>
      </div>
    </div>
  )
}
