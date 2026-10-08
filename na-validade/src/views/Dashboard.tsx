import { AlertTriangle, ChevronRight, CircleCheck, TrendingDown } from 'lucide-react'
import { LotCard, StatusBadge } from '../components/LotCard.tsx'
import { EmptyState, ErrorBox, Loading } from '../components/ui.tsx'
import { useOpenLot } from '../lotSheet.ts'
import { storeParam, useApi } from '../queries.ts'
import type { DashboardData } from '../types.ts'
import { formatDate, formatMoney, formatQty, STATUS_META } from '../utils.ts'
import type { LotFilter } from './LotsView.tsx'

// Home screen: expiry summary, lots that need action now and the next expiries.
export function Dashboard({ storeId, onOpenFilter }: { storeId: number | 'all'; onOpenFilter: (f: LotFilter) => void }) {
  const openLot = useOpenLot()
  const { data, error, refetch } = useApi<DashboardData>(['dashboard'], '/api/dashboard', { storeId: storeParam(storeId) })
  if (error) return <ErrorBox error={error} onRetry={refetch} />
  if (!data) return <Loading />

  const { counts } = data
  const total = counts.expired + counts.week + counts.month + counts.ok
  const attention = counts.expired + counts.week
  const cards = [
    { f: 'expired' as const, label: 'Vencidos', value: counts.expired },
    { f: 'week' as const, label: 'Vencem em até 7 dias', value: counts.week },
    { f: 'month' as const, label: 'Vencem em até 30 dias', value: counts.month },
    { f: 'ok' as const, label: 'Em dia', value: counts.ok },
  ]

  return (
    <div className="space-y-6">
      {/* Summary card: all texts centered; red only when something needs action. */}
      <div className="flex flex-col items-center rounded-2xl bg-white p-5 text-center ring-1 ring-stone-200">
        <p className="text-sm font-medium text-stone-500">Resumo de hoje</p>
        {attention > 0 ? (
          <p className="mt-1.5 inline-flex items-center justify-center gap-2 text-xl font-bold leading-tight text-rose-600">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
            {attention} {attention === 1 ? 'lote precisa' : 'lotes precisam'} da sua atenção
          </p>
        ) : (
          <p className="mt-1.5 text-xl font-semibold leading-tight text-stone-900">Tudo certo por aqui!</p>
        )}
        <p className="mt-1 text-sm text-stone-500">{total} lotes ativos sendo monitorados</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {cards.map(({ f, label, value }) => (
          <button
            key={f}
            onClick={() => onOpenFilter(f)}
            className="rounded-xl bg-white p-4 text-left ring-1 ring-stone-200 transition active:bg-stone-50"
          >
            <p className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_META[f].bar}`} aria-hidden /> {label}
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-stone-900">{value}</p>
          </button>
        ))}
      </div>

      {data.losses && (
        <div className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <TrendingDown className="h-5 w-5 shrink-0 text-stone-400" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs font-bold text-stone-500">Perdas por validade este mês</p>
            <p className="text-2xl font-semibold text-stone-800">{formatMoney(data.losses.expired.value)}</p>
            <p className="text-xs text-stone-500">
              Total de perdas (vencidos, danificados e outros): {formatMoney(data.losses.total.value)} · {formatQty(data.losses.total.quantity, 'un')}
            </p>
          </div>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-800">Produtos que precisam de atenção</h2>
        </div>
        {data.attention.length === 0 ? (
          <EmptyState icon={CircleCheck} title="Nada vencido ou vencendo nesta semana" text="Continue escaneando os lotes que chegam nas lojas." />
        ) : (
          <div className="space-y-2.5">
            {data.attention.map((l) => (
              <LotCard key={l.id} lot={l} onOpen={() => openLot(l.id)} onWithdraw={() => openLot(l.id, 'withdraw')} />
            ))}
          </div>
        )}
      </section>

      {data.upcoming.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-800">Próximos vencimentos</h2>
            <button onClick={() => onOpenFilter('active')} className="flex items-center text-sm font-bold text-brand-600">
              Ver todos <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                <tr>
                  <th className="px-3 py-2">Produto · loja · lote</th>
                  <th className="px-2 py-2 text-right">Qtd.</th>
                  <th className="px-2 py-2">Validade</th>
                  <th className="px-3 py-2"><span className="sr-only">Ação</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.upcoming.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2.5">
                      <p className="line-clamp-2 font-bold leading-tight">{l.product.name}</p>
                      <p className="text-xs text-stone-500">{l.store.name}{l.lotNumber && ` · ${l.lotNumber}`}</p>
                    </td>
                    <td className="whitespace-nowrap px-2 text-right font-bold">{formatQty(l.quantity, l.product.unit)}</td>
                    <td className="px-2">
                      <p className="font-semibold">{formatDate(l.expiryDate)}</p>
                      <StatusBadge lot={l} short />
                    </td>
                    <td className="px-3 text-right">
                      <button onClick={() => openLot(l.id)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {storeId === 'all' && data.byStore.length > 1 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-stone-800">Por loja</h2>
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                <tr>
                  <th className="px-3 py-2 text-left">Loja</th>
                  <th className="px-2 py-2">Vencidos</th>
                  <th className="px-2 py-2">7 dias</th>
                  <th className="px-2 py-2">30 dias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-center font-bold">
                {data.byStore.map((s) => (
                  <tr key={s.storeId}>
                    <td className="px-3 py-2.5 text-left">{s.name}</td>
                    <td className={s.expired ? 'text-rose-600' : 'text-stone-400'}>{s.expired}</td>
                    <td className={s.week ? 'text-orange-600' : 'text-stone-400'}>{s.week}</td>
                    <td className={s.month ? 'text-yellow-700' : 'text-stone-400'}>{s.month}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
