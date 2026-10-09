import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Check, Circle, CircleAlert, Eye, EyeOff, LoaderCircle, RefreshCw, X, type LucideIcon } from 'lucide-react'
import { PASSWORD_RULES } from '../../shared/validation.ts'

// Shared form building blocks so every screen has the same look.
export const inputCls =
  'w-full rounded-xl bg-card px-4 py-3 font-medium ring-1 ring-line outline-none placeholder:font-normal placeholder:text-ink-3 focus:ring-2 focus:ring-brand'

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="pl-1 text-sm font-medium text-ink-2">{label}</span>
      {children}
      {hint && !error && <span className="block pl-1 text-xs text-ink-2">{hint}</span>}
      {error && <span className="block pl-1 text-xs font-bold text-danger">{error}</span>}
    </label>
  )
}

// Live checklist of the password rules, ticked as the user types.
export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="grid grid-cols-1 gap-1 pl-1 text-xs sm:grid-cols-2" aria-label="Requisitos da senha">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value)
        return (
          <li key={r.label} className={`flex items-center gap-1.5 ${ok ? 'font-bold text-brand' : 'text-ink-2'}`}>
            {ok ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            {r.label}
            <span className="sr-only">{ok ? '(ok)' : '(pendente)'}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={`${inputCls} pr-12`} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        className="absolute inset-y-0 right-0 grid w-12 place-items-center text-ink-3"
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  )
}

export function PrimaryButton({ loading, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className={`flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-base font-semibold text-on-brand transition active:scale-[0.98] disabled:opacity-50 disabled:shadow-none ${className}`}
    >
      {loading && <LoaderCircle className="h-5 w-5 animate-spin" />}
      {children}
    </button>
  )
}

export const secondaryBtn =
  'flex w-full items-center justify-center gap-2 rounded-xl bg-card py-3 font-bold text-ink-2 ring-1 ring-line transition active:scale-[0.98]'

export function Chips<T extends string>({
  options, value, onChange, labels,
}: {
  options: readonly T[]
  value: T | null
  onChange: (v: T) => void
  labels?: Partial<Record<T, string>>
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${
            value === o ? 'bg-brand text-on-brand' : 'bg-surface text-ink-2'
          }`}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl bg-card p-4 text-left ring-1 ring-line"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{label}</span>
        {description && <span className="block text-xs text-ink-2">{description}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-brand' : 'bg-ink-3/40'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-card shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  )
}

// Bottom sheet on phones, centered dialog on larger screens.
export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[92dvh] w-full max-w-lg animate-pop overflow-y-auto rounded-t-2xl bg-surface p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card ring-1 ring-line">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-sm font-semibold text-ink-2">
      <LoaderCircle className="h-5 w-5 animate-spin text-ink-3" /> {label}
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-danger-bg p-6 text-center text-danger">
      <CircleAlert className="h-8 w-8" />
      <p className="text-sm font-semibold">{(error as Error)?.message ?? 'Algo deu errado.'}</p>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-bold ring-1 ring-danger/30">
          <RefreshCw className="h-4 w-4" /> Tentar de novo
        </button>
      )}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-card p-8 text-center ring-1 ring-line">
      <Icon className="h-8 w-8 text-ink-3" />
      <p className="font-bold">{title}</p>
      {text && <p className="text-sm text-ink-2">{text}</p>}
    </div>
  )
}

export function FormError({ message }: { message: string }) {
  if (!message) return null
  return <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm font-bold text-danger">{message}</p>
}
