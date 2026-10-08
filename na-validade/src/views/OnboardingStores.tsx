import { useState } from 'react'
import { Minus, Plus, Store as StoreIcon } from 'lucide-react'
import { api, post } from '../api.ts'
import { setMe } from '../queries.ts'
import type { Me } from '../types.ts'
import { StoreFields } from '../components/StoreFields.tsx'
import { draftToStore, emptyStore, storeErrors, type StoreDraft } from '../storeDraft.ts'
import { FormError, PrimaryButton } from '../components/ui.tsx'

// Step 2 of sign-up: user tells how many stores they have and fills one form per store.
export function OnboardingStores({ user, onLogout }: { user: Me['user']; onLogout: () => void }) {
  const [drafts, setDrafts] = useState<StoreDraft[]>([emptyStore()])
  const [showErrors, setShowErrors] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const count = drafts.length

  // Grows or shrinks the list of store forms, keeping what was already typed.
  function setCount(n: number) {
    const next = Math.min(50, Math.max(1, n))
    setDrafts((d) => Array.from({ length: next }, (_, i) => d[i] ?? emptyStore()))
  }

  const allErrors = drafts.map(storeErrors)
  const hasErrors = allErrors.some((e) => Object.keys(e).length > 0)

  async function finish() {
    setShowErrors(true)
    if (hasErrors) return
    setLoading(true)
    setError('')
    try {
      await post('/api/stores', { stores: drafts.map(draftToStore) })
      setMe(await api<Me>('/api/auth/me'))
    } catch (e) {
      setError((e as Error).message)
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg space-y-5 px-4 pb-10 pt-[max(2rem,env(safe-area-inset-top))]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Passo 2 de 2 · Suas lojas</p>
        <h1 className="mt-1 text-2xl font-semibold">Olá, {user.firstName}! Vamos cadastrar suas lojas.</h1>
      </div>

      <div className="rounded-2xl bg-brand-500 p-5 text-white">
        <p className="font-bold">Quantas lojas você tem?</p>
        <div className="mt-3 flex items-center justify-between">
          <button onClick={() => setCount(count - 1)} className="grid h-12 w-12 place-items-center rounded-xl bg-white/20 active:scale-95" aria-label="Menos">
            <Minus className="h-6 w-6" />
          </button>
          <div className="text-center">
            <p className="text-5xl font-semibold leading-none">{count}</p>
            <p className="text-sm font-semibold text-white/90">{count === 1 ? 'loja' : 'lojas'}</p>
          </div>
          <button onClick={() => setCount(count + 1)} className="grid h-12 w-12 place-items-center rounded-xl bg-white/20 active:scale-95" aria-label="Mais">
            <Plus className="h-6 w-6" />
          </button>
        </div>
        <div className="mt-4 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={`h-9 w-9 rounded-full text-sm font-semibold transition ${count === n ? 'bg-white text-brand-600' : 'bg-white/20 text-white'}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {drafts.map((d, i) => (
        <div key={i} className="animate-pop space-y-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-600">
              <StoreIcon className="h-5 w-5" />
            </div>
            <p className="text-lg font-semibold">Loja {i + 1}</p>
          </div>
          <StoreFields
            value={d}
            errors={showErrors ? allErrors[i] : undefined}
            onChange={(nd) => setDrafts((all) => all.map((x, j) => (j === i ? nd : x)))}
          />
        </div>
      ))}

      {showErrors && hasErrors && <FormError message="Confira os campos destacados." />}
      <FormError message={error} />
      <PrimaryButton loading={loading} onClick={finish}>Concluir cadastro</PrimaryButton>
      <button onClick={onLogout} className="w-full text-center text-sm font-bold text-stone-400">Sair</button>
    </div>
  )
}
