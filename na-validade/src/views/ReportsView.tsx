import { useState, type ReactNode } from 'react'
import { BarChart3, CalendarDays, Download, PackageMinus, ShieldAlert } from 'lucide-react'
import { LOSS_REASONS, REASON_LABEL } from '../../shared/domain.ts'
import { ErrorBox, Field, inputCls, Loading } from '../components/ui.tsx'
import { useOpenLot } from '../lotSheet.ts'
import { storeParam, useApi } from '../queries.ts'
import type { ReportData } from '../types.ts'
import { downloadCsv, formatDate, formatDateTime, formatMoney, formatQty, isoInDays } from '../utils.ts'

const PERIODS = ['month', '30', '90', 'custom'] as const
type PeriodId = (typeof PERIODS)[number]
const PERIOD_LABEL: Record<PeriodId, string> = { month: 'Este mês', '30': '30 dias', '90': '90 dias', custom: 'Personalizado' }
const SHORT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function periodText(p: PeriodId, r: { from: string; to: string }) {
  if (p === 'month') return `em ${new Date(`${r.from}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' })}`
  if (p === 'custom') return `de ${formatDate(r.from)} a ${formatDate(r.to)}`
  return `nos últimos ${p} dias`
}

const daysUntil = (iso: string) => Math.round((Date.parse(iso) - Date.parse(isoInDays(0))) / 86_400_000)

function range(p: PeriodId, from: string, to: string) {
  const today = isoInDays(0)
  if (p === 'month') return { from: `${today.slice(0, 8)}01`, to: today }
  if (p === 'custom') {
    const a = from || isoInDays(-29)
    const b = to || today
    // Dates picked in reverse order are swapped instead of rejected.
    return a <= b ? { from: a, to: b } : { from: b, to: a }
  }
  return { from: isoInDays(-Number(p) + 1), to: today }
}

// Losses, validity and withdrawal history for the selected period and store.
export function ReportsView({ storeId, storeChip, onAddCost }: { storeId: number | 'all'; storeChip: ReactNode; onAddCost: () => void }) {
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
      ['Data', 'Loja', 'Produto', 'Código', 'Setor', 'Lote', 'Validade', 'Quantidade', 'Motivo', 'Valor (R$)', 'Responsável', 'Observações'],
      data.history.map((h) => [
        formatDateTime(h.createdAt), h.store, h.product, h.barcode, h.category, h.lotNumber, formatDate(h.expiryDate),
        h.quantity, REASON_LABEL[h.reason], h.totalCost?.toFixed(2).replace('.', ','), h.user, h.notes,
      ]),
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Relatórios</h1>
        {storeChip}
      </div>
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            aria-label={p === 'custom' ? PERIOD_LABEL.custom : undefined}
            onClick={() => setPeriod(p)}
            className={`flex items-center rounded-full px-3.5 py-2 text-sm font-bold transition ${period === p ? 'bg-brand text-on-brand' : 'bg-surface text-ink-2'}`}
          >
            {p === 'custom' ? <CalendarDays className="h-4 w-4" /> : PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="De">
              <input type="date" className={inputCls} value={from || r.from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Até">
              <input type="date" className={inputCls} value={to || r.to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <p className="pl-1 text-xs text-ink-2">Mostrando de {formatDate(r.from)} a {formatDate(r.to)}</p>
        </div>
      )}

      {error ? <ErrorBox error={error} onRetry={refetch} /> : !data ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
              <p className="text-xs font-bold text-ink-2">Perdas</p>
              <p className={`mt-1 text-xl font-extrabold ${data.losses.total.value > 0 ? 'text-danger' : data.losses.total.quantity > 0 ? 'text-ink' : 'text-ink-3'}`}>
                {formatMoney(data.losses.total.value)}
              </p>
              <p className="mt-0.5 text-xs text-ink-2">
                {data.losses.total.quantity > 0
                  ? `${formatQty(data.losses.total.quantity, 'un')} em ${data.losses.total.count === 1 ? '1 retirada' : `${data.losses.total.count ?? 0} retiradas`}`
                  : `Nenhuma perda ${periodText(period, r)}`}
              </p>
            </div>
            <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
              <p className="text-xs font-bold text-ink-2">Perdas evitadas</p>
              {data.hasCosts ? (
                <>
                  <p className={`mt-1 text-xl font-extrabold ${data.avoided.value > 0 ? 'text-ink' : 'text-ink-3'}`}>{formatMoney(data.avoided.value)}</p>
                  <p className="mt-0.5 text-xs text-ink-2">
                    {data.avoided.quantity > 0 ? `${formatQty(data.avoided.quantity, 'un')} vendidas em promoção ou devolvidas antes de vencer` : 'Vendas em promoção e devoluções antes de vencer'}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-xl font-extrabold text-ink-3">R$ —</p>
                  <button onClick={onAddCost} className="mt-0.5 text-left text-xs font-bold text-brand underline underline-offset-2">Adicionar preço de custo</button>
                </>
              )}
            </div>
          </div>
          {data.losses.total.quantity > 0 && data.losses.total.value === 0 && (
            <p className="rounded-xl bg-surface p-3 text-sm font-semibold text-ink-2">
              Cadastre o preço de custo dos produtos para ver o valor em reais das perdas.
            </p>
          )}

          <Section title="Em risco nos próximos 7 dias" icon={ShieldAlert}>
            {data.atRisk.length === 0 ? <Empty text="Nenhum produto vencendo nos próximos 7 dias." /> : data.atRisk.map((p) => {
              const d = daysUntil(p.nextExpiry)
              return (
                <div key={p.productId} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{p.name}</p>
                    <p className="truncate text-xs text-ink-2">
                      {p.stores} · {p.lots} {p.lots === 1 ? 'lote' : 'lotes'} · {formatQty(p.quantity, p.unit)} · {formatDate(p.nextExpiry)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${d < 0 ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning'}`}>
                    {d < 0 ? 'Vencido' : d === 0 ? 'Hoje' : d === 1 ? '1 dia' : `${d} dias`}
                  </span>
                </div>
              )
            })}
          </Section>

          <MonthlyChart rows={data.monthly} />

          <Bars title="Perdas por motivo" rows={data.losses.byReason.map((x) => ({ key: x.reason, label: REASON_LABEL[x.reason] + (LOSS_REASONS.includes(x.reason) ? '' : ' (não é perda)'), value: x.value, qty: x.quantity }))} />
          <Bars title="Setores com maior perda" rows={data.losses.byCategory.map((x) => ({ key: x.category, label: x.category, value: x.value, qty: x.quantity }))} />
          {data.losses.byStore.length > 1 && (
            <Bars title="Lojas com maior perda" rows={data.losses.byStore.map((x) => ({ key: String(x.storeId), label: `${x.name} · ${x.expiredCount} vencidos`, value: x.value, qty: x.quantity }))} />
          )}
          <Section title="Produtos com maior perda" icon={PackageMinus}>
            {data.losses.byProduct.length === 0 ? <Empty text="Nenhuma perda no período." /> : data.losses.byProduct.map((p) => (
              <Row key={p.productId} title={p.name} sub={`${p.category} · ${formatQty(p.quantity, 'un')}`} value={formatMoney(p.value)} />
            ))}
          </Section>

          <section className="space-y-2">
            <h2 className="text-lg font-extrabold">Validade agora, por loja</h2>
            <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-line">
              <table className="w-full text-sm">
                <thead className="bg-surface text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  <tr><th className="px-3 py-2 text-left">Loja</th><th className="px-2">Vencidos</th><th className="px-2">7 dias</th><th className="px-2">30 dias</th></tr>
                </thead>
                <tbody className="divide-y divide-line text-center font-bold">
                  {data.validity.byStore.map((s) => (
                    <tr key={s.storeId}>
                      <td className="px-3 py-2.5 text-left">{s.name}</td>
                      <td className={s.expired ? 'text-danger' : 'text-ink-3'}>{s.expired}</td>
                      <td className={s.week ? 'text-warning' : 'text-ink-3'}>{s.week}</td>
                      <td className={s.month ? 'text-warning' : 'text-ink-3'}>{s.month}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">Histórico de retiradas</h2>
              {data.history.length > 0 && (
                <button onClick={exportHistory} className="flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-sm font-bold text-ink-2 ring-1 ring-line">
                  <Download className="h-4 w-4" /> Planilha
                </button>
              )}
            </div>
            {data.history.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-ink-3/50 p-5 text-center text-sm text-ink-2">
                Nenhuma retirada ainda — quando você retirar um produto, ele aparece aqui com o motivo.
              </p>
            ) : (
              <div className="space-y-2">
                {data.history.map((h) => (
                  <button key={h.id} onClick={() => openLot(h.lotId)} className="block w-full rounded-xl bg-card p-3 text-left text-sm ring-1 ring-line">
                    <div className="flex justify-between gap-2">
                      <p className="truncate font-bold">{h.product}</p>
                      {h.totalCost != null && <p className={`shrink-0 font-semibold ${LOSS_REASONS.includes(h.reason) ? 'text-danger' : 'text-ink-2'}`}>{formatMoney(h.totalCost)}</p>}
                    </div>
                    <p className="text-xs text-ink-2">
                      {formatQty(h.quantity, h.unit)} · {REASON_LABEL[h.reason]} · {h.store}{h.lotNumber && ` · Lote ${h.lotNumber}`}
                    </p>
                    <p className="text-xs text-ink-3">{h.user} · {formatDateTime(h.createdAt)}</p>
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
      <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon className="h-5 w-5 text-ink-3" /> {title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-card ring-1 ring-line">{children}</div>
    </section>
  )
}

function MonthlyChart({ rows }: { rows: ReportData['monthly'] }) {
  const byValue = rows.some((r) => r.value > 0)
  const v = (r: ReportData['monthly'][number]) => (byValue ? r.value : r.quantity)
  const max = Math.max(...rows.map(v), 0)
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-lg font-extrabold"><BarChart3 className="h-5 w-5 text-ink-3" /> Perdas por mês</h2>
      <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
        <div className="flex h-32 items-end gap-2">
          {rows.map((r) => (
            <div key={r.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className={`text-[10px] font-bold ${v(r) > 0 ? 'text-ink-2' : 'text-ink-3'}`}>
                {v(r) > 0 ? (byValue ? formatMoney(r.value).replace(/,\d{2}$/, '') : formatQty(r.quantity, 'un')) : ''}
              </span>
              <div className="flex w-full flex-1 items-end overflow-hidden rounded-lg bg-surface">
                <div className="w-full rounded-lg bg-brand" style={{ height: max > 0 ? `${(v(r) / max) * 100}%` : 0 }} />
              </div>
              <span className="text-[11px] font-semibold text-ink-3">{SHORT_MONTHS[Number(r.month.slice(5, 7)) - 1]}</span>
            </div>
          ))}
        </div>
        {max === 0 && <p className="mt-3 text-center text-sm text-ink-2">O gráfico ganha forma a partir do primeiro mês de uso.</p>}
      </div>
    </section>
  )
}

function Row({ title, sub, value }: { title: string; sub: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{title}</p>
        <p className="truncate text-xs text-ink-2">{sub}</p>
      </div>
      <p className="shrink-0 font-semibold">{value}</p>
    </div>
  )
}

const Empty = ({ text }: { text: string }) => <p className="px-4 py-5 text-center text-sm text-ink-2">{text}</p>

function Bars({ title, rows }: { title: string; rows: { key: string; label: string; value: number; qty: number }[] }) {
  if (!rows.length) return null
  const byValue = rows.some((r) => r.value > 0)
  const max = Math.max(...rows.map((r) => (byValue ? r.value : r.qty)), 1)
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-extrabold">{title}</h2>
      <div className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-line">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="flex justify-between gap-2 text-sm">
              <span className="truncate font-semibold">{r.label}</span>
              <span className="shrink-0 font-semibold">{byValue ? formatMoney(r.value) : formatQty(r.qty, 'un')}</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-brand" style={{ width: `${((byValue ? r.value : r.qty) / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
