import { useState, type FormEvent } from 'react'
import { AtSign, KeyRound } from 'lucide-react'
import { post } from '../api.ts'
import type { Me } from '../types.ts'
import { JOB_TITLES } from '../../shared/domain.ts'
import { Chips, Field, inputCls, PasswordInput, PasswordRules, PrimaryButton } from '../components/ui.tsx'
import { isStrongPassword, isValidEmail, suggestEmail, isValidPhone, maskPhone } from '../../shared/validation.ts'

// Welcome screen with "Entrar" (login) and "Criar conta" (sign-up) tabs.
export function AuthView({ onAuth }: { onAuth: (me: Me) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="mb-6 flex flex-col items-center text-center">
        <img src="/favicon.svg" alt="" className="mb-3 h-20 w-20 rounded-2xl" />
        <h1 className="text-3xl font-semibold text-ink">Validei</h1>
        <p className="mt-1 text-sm font-semibold text-ink-2">Controle de validade dos seus produtos</p>
      </div>

      <div className="rounded-2xl bg-card/80 p-5 ring-1 ring-line backdrop-blur">
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-surface p-1">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-xl py-2.5 text-sm font-semibold transition ${mode === m ? 'bg-card text-brand' : 'text-ink-2'}`}
            >
              {m === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          ))}
        </div>
        <div key={mode} className="animate-pop">
          {mode === 'login' ? <LoginForm onAuth={onAuth} onSignup={() => setMode('signup')} /> : <SignupForm onAuth={onAuth} />}
        </div>
      </div>
    </div>
  )
}

function LoginForm({ onAuth, onSignup }: { onAuth: (me: Me) => void; onSignup: () => void }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      onAuth(await post<Me>('/api/auth/login', { identifier, password }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Everyone (owner and team) logs in with e-mail. */}
      <Field label="E-mail">
        <div className="relative">
          <AtSign className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
          <input
            className={`${inputCls} pl-12`}
            type="email"
            inputMode="email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value.trim())}
            placeholder="voce@email.com"
            autoComplete="username"
            autoCapitalize="none"
          />
        </div>
      </Field>
      <Field label="Senha">
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" autoComplete="current-password" />
      </Field>
      {error && <p className="rounded-xl bg-danger-bg p-3 text-sm font-bold text-danger">{error}</p>}
      <PrimaryButton loading={loading} disabled={!identifier || !password}>
        <KeyRound className="h-5 w-5" /> Entrar
      </PrimaryButton>
      <p className="text-center text-sm text-ink-2">
        Ainda não tem conta?{' '}
        <button type="button" onClick={onSignup} className="font-semibold text-brand">Cadastre-se</button>
      </p>
    </form>
  )
}

function SignupForm({ onAuth }: { onAuth: (me: Me) => void }) {
  const [f, setF] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    jobTitle: 'Proprietário(a)' as (typeof JOB_TITLES)[number], password: '', confirm: '', terms: false,
  })
  const [errors, setErrors] = useState<Partial<Record<keyof typeof f, string>>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((p) => ({ ...p, [k]: v }))
    // Clears the field's error as soon as the user edits it.
    setErrors(({ [k]: _removed, ...rest }) => rest as typeof errors)
  }

  // Field-by-field validation shown under each input.
  function validate() {
    const e: typeof errors = {}
    if (!f.firstName.trim()) e.firstName = 'Informe seu nome'
    if (!f.lastName.trim()) e.lastName = 'Informe seu sobrenome'
    if (!isValidEmail(f.email)) e.email = 'E-mail inválido'
    if (!isValidPhone(f.phone)) e.phone = 'Telefone inválido (com DDD)'
    if (!isStrongPassword(f.password)) e.password = 'A senha não cumpre todos os requisitos abaixo'
    if (f.confirm !== f.password) e.confirm = 'As senhas não conferem'
    if (!f.terms) e.terms = 'É preciso aceitar os termos para continuar'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // Creates company + admin user on the API; the session cookie is set by the server.
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setLoading(true)
    try {
      onAuth(await post<Me>('/api/auth/signup', {
        firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email, phone: f.phone,
        jobTitle: f.jobTitle, password: f.password, acceptTerms: f.terms,
      }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">Passo 1 de 2 · Seus dados</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome *" error={errors.firstName}>
          <input className={inputCls} value={f.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="given-name" placeholder="Maria" />
        </Field>
        <Field label="Sobrenome *" error={errors.lastName}>
          <input className={inputCls} value={f.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="family-name" placeholder="Silva" />
        </Field>
      </div>
      {/* No CNPJ at sign-up: it is asked for each store in the next step. The e-mail is the login. */}
      <Field label="E-mail *" hint="Você vai usar o e-mail para entrar no app." error={errors.email}>
        <input className={inputCls} type="email" value={f.email} onChange={(e) => set('email', e.target.value.trim())} autoComplete="email" placeholder="voce@email.com" />
        {suggestEmail(f.email) && (
          <button type="button" onClick={() => set('email', suggestEmail(f.email)!)} className="pl-1 text-left text-xs font-bold text-warning">
            Você quis dizer <span className="underline">{suggestEmail(f.email)}</span>?
          </button>
        )}
      </Field>
      <Field label="Telefone / WhatsApp *" error={errors.phone}>
        <input className={inputCls} inputMode="tel" value={f.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} autoComplete="tel-national" placeholder="(11) 98765-4321" />
      </Field>
      <div className="space-y-1.5">
        <span className="pl-1 text-sm font-bold text-ink-2">Cargo</span>
        <Chips options={JOB_TITLES} value={f.jobTitle} onChange={(r) => set('jobTitle', r)} />
      </div>
      <Field label="Senha *" error={errors.password}>
        <PasswordInput value={f.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" />
      </Field>
      <PasswordRules value={f.password} />
      <Field label="Confirmar senha *" error={errors.confirm}>
        <PasswordInput value={f.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" placeholder="Repita a senha" />
      </Field>
      <label className="flex items-start gap-3 rounded-xl bg-surface p-3 text-sm text-ink-2">
        <input type="checkbox" checked={f.terms} onChange={(e) => set('terms', e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
        <span>
          Li e aceito os <b>Termos de uso</b> e a <b>Política de privacidade</b>, e autorizo o uso dos meus dados para o funcionamento do app (LGPD).
          {errors.terms && <span className="mt-1 block text-xs font-bold text-danger">{errors.terms}</span>}
        </span>
      </label>
      {error && <p className="rounded-xl bg-danger-bg p-3 text-sm font-bold text-danger">{error}</p>}
      <PrimaryButton loading={loading}>Continuar</PrimaryButton>
    </form>
  )
}
