import { useState } from 'react'
import { Download, PackageMinus, ShieldAlert, TrendingDown } from 'lucide-react'
import { LOSS_REASONS, REASON_LABEL } from '../../shared/domain.ts'
import { Chips, ErrorBox, inputCls, Loading } from '../components/ui.tsx'
import { useOpenLot } from '../lotSheet.ts'
import { storeParam, useApi } from '../queries.ts'
import type { ReportData } from '../types.ts'
import { downloadCsv, formatDate, formatDateTime, formatMoney, formatQty, isoInDays } from '../utils.ts'

const PERIODS = ['month', '30', '90', 'custom'] as const
type PeriodId = (typeof PERIODS)[number]
const PERIOD_LABEL: Record<PeriodId, string> = { month: 'Este mês', '30': '30 dias', '90': '90 dias', custom: 'Personalizado' }

function range(p: PeriodId, from: string, to: string) {
  const today = isoInDays(0)
  if (p === 'month') return { from: `${today.slice(0, 8)}01`, to: today }
  if (p === 'custom') return { from: from || today, to: to || today }
  return { from: isoInDays(-Number(p) + 1), to: today }
}

// Losses, validity and withdrawal history for the selected period and store.
export function ReportsView({ storeId }: { storeId: number | 'all' }) {
  const openLot = useOpenLot()
  const [period, setPeriod] = useState<PeriodId>('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const r = range(period, from, to)
  const { data, error, refetch } = useApi<ReportData>(['reports'], '/api/reports', { storeId: storeParam(storeId), ...r })

  function exportHistory() {
    if (!data) return
    downloadCsv(
      `retiradas-${r.from}-a-${r.to}.csv`,
      ['Data', 'Loja', 'Produto', 'Código', 'Categoria', 'Lote', 'Validade', 'Quantidade', 'Motivo', 'Valor (R$)', 'Responsável', 'Observações'],
      data.history.map((h) => [
        formatDateTime(h.createdAt), h.store, h.product, h.barcode, h.category, h.lotNumber, formatDate(h.expiryDate),
        h.quantity, REASON_LABEL[h.reason], h.totalCost?.toFixed(2).replace('.', ','), h.user, h.notes,
      ]),
    )
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Relatórios</h1>
      <Chips options={PERIODS} value={period} onChange={setPeriod} labels={PERIOD_LABEL} />
      {period === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <input type="date" aria-label="De" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" aria-label="Até" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      )}

      {error ? <ErrorBox error={error} onRetry={refetch} /> : !data ? <Loading /> : (
        <>
          <div className="rounded-2xl bg-rose-500 p-5 text-white">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-white/90"><TrendingDown className="h-4 w-4" /> Perda estimada no período</p>
            <p className="mt-1 text-3xl font-semibold">{formatMoney(data.losses.total.value)}</p>
            <p className="mt-1 text-sm text-white/90">
              {formatQty(data.losses.total.quantity, 'un')} perdidas em {data.losses.total.count ?? 0} retiradas · {formatDate(data.period.from)} a {formatDate(data.period.to)}
            </p>
          </div>
          {data.losses.total.quantity > 0 && data.losses.total.value === 0 && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              Cadastre o preço de custo dos produtos para ver o valor em reais das perdas.
            </p>
          )}

          <Section title="Maior risco de perda nos próximos 7 dias" icon={ShieldAlert}>
            {data.atRisk.length === 0 ? <Empty text="Nenhum produto vencendo nos próximos 7 dias." /> : data.atRisk.map((p) => (
              <Row key={p.productId} title={p.name} sub={`${p.lots} ${p.lots === 1 ? 'lote' : 'lotes'} · ${formatQty(p.quantity, p.unit)} · vence ${formatDate(p.nextExpiry)}`} value={p.value ? formatMoney(p.value) : '—'} />
            ))}
          </Section>

          <Bars title="Perdas por motivo" rows={data.losses.byReason.map((x) => ({ key: x.reason, label: REASON_LABEL[x.reason] + (LOSS_REASONS.includes(x.reason) ? '' : ' (não é perda)'), value: x.value, qty: x.quantity }))} />
          <Bars title="Categorias com maior perda" rows={data.losses.byCategory.map((x) => ({ key: x.category, label: x.category, value: x.value, qty: x.quantity }))} />
          {data.losses.byStore.length > 1 && (
            <Bars title="Lojas com maior perda" rows={data.losses.byStore.map((x) => ({ key: String(x.storeId), label: `${x.name} · ${x.expiredCount} vencidos`, value: x.value, qty: x.quantity }))} />
          )}
          <Section title="Produtos com maior perda" icon={PackageMinus}>
            {data.losses.byProduct.length === 0 ? <Empty text="Nenhuma perda no período." /> : data.losses.byProduct.map((p) => (
              <Row key={p.productId} title={p.name} sub={`${p.category} · ${formatQty(p.quantity, 'un')}`} value={formatMoney(p.value)} />
            ))}
          </Section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Validade agora</h2>
            <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  <tr><th className="px-3 py-2 text-left">Loja</th><th className="px-2">Vencidos</th><th className="px-2">7 dias</th><th className="px-2">30 dias</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-center font-bold">
                  {data.validity.byStore.map((s) => (
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

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Histórico de retiradas</h2>
              {data.history.length > 0 && (
                <button onClick={exportHistory} className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-stone-600 ring-1 ring-stone-200">
                  <Download className="h-4 w-4" /> Planilha
                </button>
              )}
            </div>
            {data.history.length === 0 ? <Empty text="Nenhuma retirada no período." /> : (
              <div className="space-y-2">
                {data.history.map((h) => (
                  <button key={h.id} onClick={() => openLot(h.lotId)} className="block w-full rounded-xl bg-white p-3 text-left text-sm ring-1 ring-stone-200">
                    <div className="flex justify-between gap-2">
                      <p className="truncate font-bold">{h.product}</p>
                      {h.totalCost != null && <p className={`shrink-0 font-semibold ${LOSS_REASONS.includes(h.reason) ? 'text-rose-600' : 'text-stone-500'}`}>{formatMoney(h.totalCost)}</p>}
                    </div>
                    <p className="text-xs text-stone-500">
                      {formatQty(h.quantity, h.unit)} · {REASON_LABEL[h.reason]} · {h.store}{h.lotNumber && ` · Lote ${h.lotNumber}`}
                    </p>
                    <p className="text-xs text-stone-400">{h.user} · {formatDateTime(h.createdAt)}</p>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof ShieldAlert; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon className="h-5 w-5 text-stone-400" /> {title}</h2>
      <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">{children}</div>
    </section>
  )
}

function Row({ title, sub, value }: { title: string; sub: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{title}</p>
        <p className="truncate text-xs text-stone-500">{sub}</p>
      </div>
      <p className="shrink-0 font-semibold">{value}</p>
    </div>
  )
}

const Empty = ({ text }: { text: string }) => <p className="px-4 py-5 text-center text-sm text-stone-500">{text}</p>

function Bars({ title, rows }: { title: string; rows: { key: string; label: string; value: number; qty: number }[] }) {
  if (!rows.length) return null
  const byValue = rows.some((r) => r.value > 0)
  const max = Math.max(...rows.map((r) => (byValue ? r.value : r.qty)), 1)
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="flex justify-between gap-2 text-sm">
              <span className="truncate font-semibold">{r.label}</span>
              <span className="shrink-0 font-semibold">{byValue ? formatMoney(r.value) : formatQty(r.qty, 'un')}</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-rose-400" style={{ width: `${((byValue ? r.value : r.qty) / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
