import { useEffect, useState } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { subscribeToast, type Toast } from '../toast.ts'

export function ToastHost() {
  const [t, setT] = useState<Toast | null>(null)
  useEffect(() => subscribeToast(setT), [])
  useEffect(() => {
    if (!t) return
    const id = setTimeout(() => setT(null), t.kind === 'error' ? 4000 : 2200)
    return () => clearTimeout(id)
  }, [t])
  if (!t) return null
  const Icon = t.kind === 'error' ? CircleAlert : CircleCheck
  return (
    <div className="fixed inset-x-0 top-4 z-[70] flex justify-center px-4" role="status" aria-live="polite">
      <div className="flex max-w-md animate-pop items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-page">
        <Icon className={`h-5 w-5 shrink-0 ${t.kind === 'error' ? 'text-danger-bg' : 'text-accent'}`} /> {t.message}
      </div>
    </div>
  )
}
