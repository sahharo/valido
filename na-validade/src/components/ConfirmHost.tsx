import { useEffect, useState } from 'react'
import { CircleAlert, Trash2 } from 'lucide-react'
import { subscribeConfirm, type ConfirmRequest } from '../confirm.ts'

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void }

// Renders the confirmation dialog requested through askConfirm()/showAlert().
export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null)
  useEffect(() => subscribeConfirm(setPending), [])
  if (!pending) return null

  const close = (ok: boolean) => {
    pending.resolve(ok)
    setPending(null)
  }
  const Icon = pending.danger ? Trash2 : CircleAlert

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center" onClick={() => close(false)}>
      <div role="dialog" aria-modal="true" className="w-full max-w-sm animate-pop rounded-2xl bg-card p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${pending.danger ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning'}`}>
          <Icon className="h-7 w-7" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">{pending.title}</h2>
        {pending.message && <p className="mt-1 text-sm text-ink-2">{pending.message}</p>}
        <div className="mt-6 flex gap-3">
          {!pending.alertOnly && (
            <button onClick={() => close(false)} className="flex-1 rounded-xl bg-surface py-3 font-bold text-ink-2 active:scale-95">
              Cancelar
            </button>
          )}
          <button
            autoFocus
            onClick={() => close(true)}
            className={`flex-1 rounded-xl py-3 font-semibold text-on-brand active:scale-95 ${pending.danger ? 'bg-danger' : 'bg-brand'}`}
          >
            {pending.alertOnly ? 'Entendi' : (pending.confirmLabel ?? 'Confirmar')}
          </button>
        </div>
      </div>
    </div>
  )
}
