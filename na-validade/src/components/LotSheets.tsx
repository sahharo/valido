import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Archive, ArrowDownToLine, Barcode, CalendarDays, Hash, Layers, PackageMinus, Store as StoreIcon, TriangleAlert } from 'lucide-react'
import { LOSS_REASONS, REASON_LABEL, WITHDRAWAL_REASONS, type WithdrawalReason } from '../../shared/domain.ts'
import { api, post } from '../api.ts'
import { LotSheetContext } from '../lotSheet.ts'
import { refreshData, useCan } from '../queries.ts'
import { toast } from '../toast.ts'
import type { LotItem, Movement } from '../types.ts'
import { formatDate, formatDateTime, formatMoney, formatQty } from '../utils.ts'
import { ProductThumb, StatusBadge } from './LotCard.tsx'
import { ErrorBox, Field, FormError, inputCls, Loading, secondaryBtn, Sheet } from './ui.tsx'

type Mode = 'view' | 'withdraw' | 'archive'

export function LotSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ id: number; mode: Mode } | null>(null)
  return (
    <LotSheetContext.Provider value={(id, action) => setOpen({ id, mode: action ?? 'view' })}>
      {children}
      {open && <LotDetailSheet key={open.id} id={open.id} initialMode={open.mode} onClose={() => setOpen(null)} />}
    </LotSheetContext.Provider>
  )
}

interface LotDetail {
  lot: LotItem
  movements: Movement[]
  fefo: LotItem[]
}

function LotDetailSheet({ id, initialMode, onClose }: { id: number; initialMode: Mode; onClose: () => void }) {
  const can = useCan()
  const [mode, setMode] = useState<Mode>(initialMode)
  const { data, error, refetch } = useQuery({ queryKey: ['lot', id], queryFn: () => api<LotDetail>(`/api/lots/${id}`) })
  const titles: Record<Mode, string> = { view: 'Detalhes do lote', withdraw: 'Marcar como retirado', archive: 'Arquivar lote' }

  if (!data)
    return (
      <Sheet title={titles.view} onClose={onClose}>
        {error ? <ErrorBox error={error} onRetry={refetch} /> : <Loading />}
      </Sheet>
    )
  const { lot, movements } = data
  const current = lot.status === 'active' ? mode : mode === 'archive' ? 'archive' : 'view'
  // Shown to users as "FIFO" (requested name); the order is still by expiry (FEFO), per store: the lot that must leave the shelf first is the one of the same store expiring first.
  const fefo = data.fefo.filter((l) => l.store.id === lot.store.id)
  const first = fefo[0]

  return (
    <Sheet title={titles[current]} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <ProductThumb product={lot.product} size="lg" />
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight">{lot.product.name}</p>
            <p className="text-sm text-stone-500">{lot.product.brand ?? lot.product.category}</p>
            <div className="mt-1"><StatusBadge lot={lot} /></div>
          </div>
        </div>

        {current === 'withdraw' && <WithdrawForm lot={lot} onDone={() => setMode('view')} />}
        {current === 'archive' && <ArchiveForm lot={lot} onDone={() => setMode('view')} />}
        {current === 'view' && (
          <>
            <dl className="grid grid-cols-2 gap-2">
              <Info icon={StoreIcon} label="Loja" value={lot.store.name} />
              <Info icon={Hash} label="Lote" value={lot.lotNumber ?? 'Sem número'} />
              <Info icon={Layers} label="Quantidade" value={`${formatQty(lot.quantity, lot.product.unit)}${lot.quantity !== lot.initialQuantity ? ` de ${lot.initialQuantity}` : ''}`} />
              <Info icon={CalendarDays} label="Validade" value={formatDate(lot.expiryDate)} />
              <Info icon={Barcode} label="Código de barras" value={lot.product.barcode} mono />
              <Info icon={ArrowDownToLine} label="Cadastrado em" value={formatDateTime(lot.createdAt)} />
            </dl>
            {lot.notes && <p className="rounded-xl bg-white p-3 text-sm text-stone-600 ring-1 ring-stone-200">{lot.notes}</p>}

            {lot.status === 'active' && first && first.id !== lot.id && (
              <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                <TriangleAlert className="h-5 w-5 shrink-0" />
                Há um lote deste produto que vence antes nesta loja ({first.lotNumber ? `lote ${first.lotNumber}, ` : ''}{formatDate(first.expiryDate)}). Ele deve sair primeiro.
              </p>
            )}
            {fefo.length > 1 && (
              <section className="space-y-2">
                <h3 className="font-semibold text-stone-700">Ordem de saída nesta loja (FIFO)</h3>
                <p className="text-xs text-stone-500">Primeiro que vence, primeiro que sai.</p>
                <ol className="space-y-1.5">
                  {fefo.map((l, i) => (
                    <li key={l.id} className={`flex items-center gap-3 rounded-xl bg-white p-3 text-sm ring-1 ${l.id === lot.id ? 'ring-2 ring-brand-400' : 'ring-stone-100'}`}>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-semibold">{i + 1}º</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {l.lotNumber ? `Lote ${l.lotNumber}` : 'Sem número'} · {formatQty(l.quantity, l.product.unit)}
                      </span>
                      <StatusBadge lot={l} />
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section className="space-y-2">
              <h3 className="font-semibold text-stone-700">Histórico</h3>
              <ol className="space-y-1.5">
                {movements.map((m) => <MovementRow key={m.id} m={m} unit={lot.product.unit} />)}
              </ol>
            </section>

            <div className="space-y-2">
              {lot.status === 'active' && can('lots:withdraw') && (
                <button
                  onClick={() => setMode('withdraw')}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-4 text-lg font-semibold text-white active:scale-[0.98]"
                >
                  <PackageMinus className="h-5 w-5" /> Marcar como retirado
                </button>
              )}
              {lot.status !== 'archived' && can('records:archive') && (
                <button onClick={() => setMode('archive')} className={`${secondaryBtn} text-stone-500`}>
                  <Archive className="h-4 w-4" /> Arquivar (cadastro errado)
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}

function Info({ icon: Icon, label, value, mono }: { icon: typeof Hash; label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-stone-200">
      <dt className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-stone-400">
        <Icon className="h-3 w-3" /> {label}
      </dt>
      <dd className={`mt-0.5 truncate font-bold ${mono ? 'font-mono text-sm' : ''}`}>{value}</dd>
    </div>
  )
}

function MovementRow({ m, unit }: { m: Movement; unit: string }) {
  const isLoss = m.reason && LOSS_REASONS.includes(m.reason)
  const title =
    m.type === 'entry' ? `Entrada de ${formatQty(m.quantity, unit)}`
      : m.type === 'withdrawal' ? `Retirada de ${formatQty(m.quantity, unit)} · ${REASON_LABEL[m.reason!]}`
        : 'Lote arquivado'
  const dot = m.type === 'entry' ? 'bg-brand-400' : m.type === 'withdrawal' ? 'bg-orange-400' : 'bg-stone-300'
  return (
    <li className="flex gap-3 rounded-xl bg-white p-3 text-sm ring-1 ring-stone-200">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <p className="font-bold">{title}</p>
        <p className="text-xs text-stone-500">{m.user} · {formatDateTime(m.createdAt)}</p>
        {m.notes && <p className="mt-0.5 text-xs text-stone-600">“{m.notes}”</p>}
        {m.type === 'withdrawal' && m.totalCost != null && (
          <p className={`mt-0.5 text-xs font-bold ${isLoss ? 'text-rose-600' : 'text-stone-500'}`}>
            {isLoss ? 'Perda estimada' : 'Valor'}: {formatMoney(m.totalCost)}
          </p>
        )}
      </div>
    </li>
  )
}

function WithdrawForm({ lot, onDone }: { lot: LotItem; onDone: () => void }) {
  const [qty, setQty] = useState(String(lot.quantity))
  const [reason, setReason] = useState<WithdrawalReason | null>(lot.expiry === 'expired' ? 'expired' : null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const q = Number(qty.replace(',', '.'))
  const cost = lot.unitCost ?? lot.product.costPrice
  const qtyError = !(q > 0) ? 'Informe a quantidade.' : q > lot.quantity ? `Máximo: ${formatQty(lot.quantity, lot.product.unit)}.` : ''
  const valid = !qtyError && reason && (reason !== 'other' || notes.trim())

  async function submit() {
    if (!valid) return
    setLoading(true)
    setError('')
    try {
      await post(`/api/lots/${lot.id}/withdraw`, { quantity: q, reason, notes: notes.trim() || undefined })
      toast(q === lot.quantity ? 'Lote marcado como retirado' : `${formatQty(q, lot.product.unit)} retiradas`)
      await refreshData()
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        {lot.store.name}{lot.lotNumber && ` · Lote ${lot.lotNumber}`} · vence {formatDate(lot.expiryDate)}
      </p>
      <Field label="Quantidade retirada" error={qty && qtyError ? qtyError : undefined}>
        <div className="flex gap-2">
          <input className={`${inputCls} text-center text-lg`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          <button
            type="button"
            onClick={() => setQty(String(lot.quantity))}
            className="shrink-0 rounded-xl bg-white px-4 text-sm font-bold text-brand-700 ring-1 ring-stone-200"
          >
            Tudo ({lot.quantity})
          </button>
        </div>
      </Field>
      <div className="space-y-1.5">
        <span className="pl-1 text-sm font-bold text-stone-600">Motivo</span>
        <div className="grid grid-cols-2 gap-2">
          {WITHDRAWAL_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => setReason(r)}
              className={`rounded-xl px-3 py-3 text-sm font-bold transition ${reason === r ? 'bg-brand-500 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}
            >
              {REASON_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
      <Field label={reason === 'other' ? 'Descreva o motivo *' : 'Observações (opcional)'}>
        <textarea className={`${inputCls} min-h-20`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      </Field>
      {reason && LOSS_REASONS.includes(reason) && q > 0 && (
        <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">
          {cost != null ? <>Perda estimada: <b>{formatMoney(cost * Math.min(q, lot.quantity))}</b> ({formatMoney(cost)} por {lot.product.unit})</> : 'Sem preço de custo cadastrado: a perda será contada só em quantidade.'}
        </p>
      )}
      <FormError message={error} />
      <div className="flex gap-2">
        <button onClick={onDone} className={secondaryBtn}>Voltar</button>
        <button
          disabled={!valid || loading}
          onClick={submit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 font-semibold text-white disabled:opacity-50 disabled:shadow-none"
        >
          Confirmar retirada
        </button>
      </div>
    </div>
  )
}

function ArchiveForm({ lot, onDone }: { lot: LotItem; onDone: () => void }) {
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    setLoading(true)
    setError('')
    try {
      await post(`/api/lots/${lot.id}/archive`, { notes: notes.trim() })
      toast('Lote arquivado')
      await refreshData()
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
        Use para lotes cadastrados por engano. O lote sai das listas e dos indicadores, mas o histórico é mantido. Para produto retirado da prateleira, use “Marcar como retirado”.
      </p>
      <Field label="Motivo do arquivamento *">
        <textarea className={`${inputCls} min-h-20`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Ex.: lote cadastrado em duplicidade" />
      </Field>
      <FormError message={error} />
      <div className="flex gap-2">
        <button onClick={onDone} className={secondaryBtn}>Voltar</button>
        <button
          disabled={notes.trim().length < 3 || loading}
          onClick={submit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          <Archive className="h-4 w-4" /> Arquivar
        </button>
      </div>
    </div>
  )
}
