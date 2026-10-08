import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Archive, AtSign, Briefcase, CalendarDays, ChevronLeft, ChevronRight, History, IdCard, KeyRound, LogOut, MapPin, Palette, Pencil, Phone, Plus,
  ShieldCheck, SlidersHorizontal, Store as StoreIcon, UserRound, UsersRound, X, Moon, Sun, SunMoon } from 'lucide-react'
import { ROLE_LABEL } from '../../shared/domain.ts'
import { isStrongPassword, maskCNPJ, maskCPF, maskPhone } from '../../shared/validation.ts'
import { api, patch, post } from '../api.ts'
import { askConfirm, showAlert } from '../confirm.ts'
import { StoreFields } from '../components/StoreFields.tsx'
import { Field, FormError, Loading, PasswordInput, PasswordRules, PrimaryButton, Toggle } from '../components/ui.tsx'
import { queryClient, refreshData, setMe, useApi, useCan } from '../queries.ts'
import { draftToStore, emptyStore, storeErrors } from '../storeDraft.ts'
import { toast } from '../toast.ts'
import type { CompanyUser, DashboardData, Me } from '../types.ts'
import { formatDateTime } from '../utils.ts'
import { personValid, toPersonDraft } from '../personDraft.ts'
import { PersonFields, UsersSection } from './UsersSection.tsx'
import { getTheme, setTheme, type ThemeChoice } from '../theme.ts'

const reloadMe = async () => setMe(await api<Me>('/api/auth/me'))

type Page = 'profile' | 'stores' | 'team' | 'company' | 'theme' | 'password' | 'audit'
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// "Ajustes": a short menu; each item opens its own page so long lists (e.g. a big team) don't make the menu scroll.
export function SettingsView({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const can = useCan()
  const [page, setPage] = useState<Page | null>(null)
  const { user } = me
  const team = useQuery({ queryKey: ['users'], queryFn: () => api<{ items: CompanyUser[] }>('/api/users'), enabled: can('users:manage') })
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()
  function go(p: Page | null) {
    setPage(p)
    window.scrollTo({ top: 0 })
  }

  if (page)
    return (
      <div className="space-y-4">
        <button onClick={() => go(null)} aria-label="Voltar" className="-ml-1 flex items-center gap-1 py-1 font-bold text-brand-600">
          <ChevronLeft className="h-5 w-5" /> Ajustes
        </button>
        {page === 'profile' && <ProfilePage me={me} />}
        {page === 'stores' && <StoresSection me={me} />}
        {page === 'team' && <UsersSection stores={me.stores} currentUserId={user.id} />}
        {page === 'company' && <CompanySection me={me} />}
        {page === 'theme' && <ThemeSection />}
        {page === 'password' && <PasswordSection onDone={() => go(null)} />}
        {page === 'audit' && <AuditSection />}
      </div>
    )

  const items: { page: Page; icon: typeof UserRound; label: string; detail?: string }[] = [
    { page: 'stores', icon: StoreIcon, label: can('stores:manage') ? 'Lojas' : 'Minhas lojas', detail: plural(me.stores.length, 'loja', 'lojas') },
    ...(can('users:manage')
      ? [{ page: 'team' as const, icon: UsersRound, label: 'Equipe', detail: team.data ? plural(team.data.items.length, 'pessoa', 'pessoas') : undefined }]
      : []),
    ...(can('settings:manage') ? [{ page: 'company' as const, icon: SlidersHorizontal, label: 'Configurações da empresa' }] : []),
    { page: 'theme', icon: Palette, label: 'Aparência' },
    { page: 'password', icon: KeyRound, label: 'Alterar senha' },
    ...(can('settings:manage') ? [{ page: 'audit' as const, icon: History, label: 'Atividade recente' }] : []),
  ]

  return (
    <div className="space-y-5">
      <button onClick={() => go('profile')} className="flex w-full items-center gap-4 rounded-2xl bg-white p-4 text-left ring-1 ring-stone-200 active:bg-stone-50">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-50 font-semibold text-brand-700">{initials}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-stone-900">{user.firstName} {user.lastName}</p>
          <p className="text-sm text-stone-500">{ROLE_LABEL[user.role]}</p>
          {/* The card is the only way into "Meus dados", so say it. */}
          <p className="mt-0.5 text-xs font-medium text-brand-600">Ver e editar meus dados</p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-stone-300" aria-hidden />
      </button>

      <nav className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        {items.map(({ page: p, icon: Icon, label, detail }) => (
          <button key={p} onClick={() => go(p)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-stone-50">
            <Icon className="h-5 w-5 shrink-0 text-stone-500" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-stone-900">{label}</span>
              {detail && <span className="block truncate text-xs text-stone-500">{detail}</span>}
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-stone-300" aria-hidden />
          </button>
        ))}
      </nav>

      <button onClick={onLogout} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3.5 font-semibold text-rose-600 ring-1 ring-stone-200 active:bg-stone-50">
        <LogOut className="h-5 w-5" /> Sair da conta
      </button>
    </div>
  )
}

// "Meus dados": profile details, with "Editar meus dados".
function ProfilePage({ me }: { me: Me }) {
  const [editing, setEditing] = useState(false)
  const { user } = me
  // CPF/CNPJ is optional now (login is by e-mail): the row is shown only when it exists.
  const doc = user.document ? (user.documentType === 'cnpj' ? maskCNPJ(user.document) : maskCPF(user.document)) : ''
  const info = [
    { icon: UserRound, label: 'Nome', value: `${user.firstName} ${user.lastName}` },
    { icon: AtSign, label: 'E-mail', value: user.email },
    { icon: Phone, label: 'Telefone', value: maskPhone(user.phone) },
    ...(doc ? [{ icon: IdCard, label: (user.documentType ?? 'cpf').toUpperCase(), value: doc }] : []),
    { icon: Briefcase, label: 'Cargo', value: user.jobTitle },
    { icon: ShieldCheck, label: 'Perfil de acesso', value: ROLE_LABEL[user.role] },
    { icon: CalendarDays, label: 'Cadastro em', value: new Date(user.createdAt).toLocaleDateString('pt-BR') },
  ]
  if (editing) return <ProfileForm me={me} onClose={() => setEditing(false)} />
  return (
    <section className="space-y-2.5">
      <h2 className="text-lg font-semibold">Meus dados</h2>
      <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        {info.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3">
            <Icon className="h-5 w-5 shrink-0 text-stone-400" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-stone-400">{label}</p>
              <p className="truncate font-semibold">{value}</p>
            </div>
          </div>
        ))}
        <button onClick={() => setEditing(true)} className="flex w-full items-center justify-center gap-2 px-4 py-3.5 font-bold text-brand-600 active:bg-brand-50">
          <Pencil className="h-4 w-4" /> Editar meus dados
        </button>
      </div>
    </section>
  )
}

function StoresSection({ me }: { me: Me }) {
  const can = useCan()
  const manage = can('stores:manage')
  const { data } = useApi<DashboardData>(['dashboard'], '/api/dashboard', { storeId: undefined })
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(emptyStore())
  const [showErrors, setShowErrors] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const errors = storeErrors(draft)

  async function addStore() {
    setShowErrors(true)
    if (Object.keys(errors).length) return
    setLoading(true)
    setError('')
    try {
      await post('/api/stores', { stores: [draftToStore(draft)] })
      await reloadMe()
      await refreshData()
      setDraft(emptyStore())
      setShowErrors(false)
      setAdding(false)
      toast('Loja adicionada')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function archiveStore(id: number) {
    if (me.stores.length === 1) return showAlert('Não é possível arquivar', 'A empresa precisa ter pelo menos uma loja ativa.')
    if (!(await askConfirm({ title: 'Arquivar esta loja?', message: 'Ela deixa de aparecer no app. O histórico é mantido.', confirmLabel: 'Arquivar', danger: true }))) return
    try {
      await post(`/api/stores/${id}/archive`)
      await reloadMe()
      await refreshData()
      toast('Loja arquivada')
    } catch (e) {
      showAlert('Não foi possível arquivar', (e as Error).message)
    }
  }

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{manage ? 'Lojas' : 'Minhas lojas'} ({me.stores.length})</h2>
        {manage && !adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-full bg-brand-500 px-3 py-1.5 text-sm font-bold text-white">
            <Plus className="h-4 w-4" /> Adicionar
          </button>
        )}
      </div>

      {adding && (
        <div className="animate-pop space-y-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Nova loja</p>
            <button onClick={() => { setAdding(false); setShowErrors(false) }} aria-label="Cancelar" className="text-stone-400"><X className="h-5 w-5" /></button>
          </div>
          <StoreFields value={draft} onChange={setDraft} errors={showErrors ? errors : undefined} />
          <FormError message={error} />
          <PrimaryButton loading={loading} onClick={addStore}>Salvar loja</PrimaryButton>
        </div>
      )}

      {me.stores.map((s) => {
        const c = data?.byStore.find((b) => b.storeId === s.id)
        // Full address: street, number - city / UF.
        const street = [s.address, s.addressNumber].filter(Boolean).join(', ')
        const place = [street, [s.city, s.uf].filter(Boolean).join(' / ')].filter(Boolean).join(' - ')
        return (
          <div key={s.id} className="flex items-center gap-3 rounded-xl bg-white p-4 ring-1 ring-stone-200">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500">
              <StoreIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{s.name}</p>
              {place && <p className="flex items-center gap-1 truncate text-xs text-stone-500"><MapPin className="h-3 w-3 shrink-0" /> {place}</p>}
              {s.cnpj && <p className="truncate text-xs text-stone-500">CNPJ {maskCNPJ(s.cnpj)}</p>}
              {c && (
                <p className="text-xs text-stone-500">
                  {c.expired + c.week + c.month + c.ok} lotes · <span className="text-rose-600">{c.expired} {c.expired === 1 ? 'vencido' : 'vencidos'}</span> ·{' '}
                  <span className="text-orange-600">{c.week} em 7 dias</span>
                </p>
              )}
            </div>
            {can('records:archive') && (
              <button onClick={() => archiveStore(s.id)} className="grid h-9 w-9 place-items-center rounded-xl text-stone-400 hover:bg-rose-50 hover:text-rose-500" aria-label={`Arquivar loja ${s.name}`}>
                <Archive className="h-4 w-4" />
              </button>
            )}
          </div>
        )
      })}
    </section>
  )
}

// Everyone (any role) can fix their own name, e-mail, phone and job title.
function ProfileForm({ me, onClose }: { me: Me; onClose: () => void }) {
  const [f, setF] = useState(() => toPersonDraft(me.user))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function save() {
    setLoading(true)
    setError('')
    try {
      setMe(await patch<Me>('/api/me', f))
      // The team list shows the same name, so refresh it too.
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast('Dados atualizados')
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  return (
    <section className="animate-pop space-y-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-semibold"><Pencil className="h-5 w-5 text-brand-500" /> Editar meus dados</p>
        <button onClick={onClose} aria-label="Fechar" className="text-stone-400"><X className="h-5 w-5" /></button>
      </div>
      <PersonFields value={f} onChange={setF} />
      <FormError message={error} />
      <PrimaryButton loading={loading} disabled={!personValid(f)} onClick={save}>Salvar meus dados</PrimaryButton>
    </section>
  )
}

function CompanySection({ me }: { me: Me }) {
  async function setEmployeesCanCreate(v: boolean) {
    try {
      setMe(await patch<Me>('/api/company', { settings: { ...me.company.settings, employeesCanCreateProducts: v } }))
      toast('Configuração salva')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }
  return (
    <section className="space-y-2.5">
      <h2 className="text-lg font-semibold">Configurações da empresa</h2>
      <Toggle
        checked={me.company.settings.employeesCanCreateProducts}
        onChange={setEmployeesCanCreate}
        label="Funcionários podem cadastrar produtos"
        description="Quando desligado, só gerentes e administradores cadastram produtos novos. Funcionários sempre podem cadastrar lotes."
      />
    </section>
  )
}

// Light / dark / automatic theme, saved on this device.
function ThemeSection() {
  const [theme, setThemeState] = useState<ThemeChoice>(getTheme)
  const options: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'dark', label: 'Escuro', icon: Moon },
    { value: 'system', label: 'Automático', icon: SunMoon },
  ]
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <div>
        <h2 className="text-lg font-semibold">Aparência</h2>
        <p className="text-sm text-stone-500">"Automático" segue o modo claro/escuro do celular.</p>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-stone-100 p-1">
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => { setTheme(value); setThemeState(value) }}
            className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-sm font-bold transition ${theme === value ? 'bg-white text-brand-700' : 'text-stone-500'}`}
          >
            <Icon className="h-5 w-5" aria-hidden /> {label}
          </button>
        ))}
      </div>
    </section>
  )
}

function PasswordSection({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    setLoading(true)
    setError('')
    try {
      await post('/api/me/password', { currentPassword: current, newPassword: next })
      toast('Senha alterada')
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="animate-pop space-y-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Alterar senha</p>
        <button onClick={onDone} aria-label="Cancelar" className="text-stone-400"><X className="h-5 w-5" /></button>
      </div>
      <Field label="Senha atual"><PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
      <Field label="Nova senha"><PasswordInput value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
      <PasswordRules value={next} />
      <FormError message={error} />
      <PrimaryButton loading={loading} disabled={!current || !isStrongPassword(next)} onClick={submit}>Salvar nova senha</PrimaryButton>
    </section>
  )
}

const ACTIONS: Record<string, string> = {
  signup: 'Criou a conta da empresa', login: 'Entrou no app', store_create: 'Cadastrou loja', store_update: 'Editou loja',
  store_archive: 'Arquivou loja', user_create: 'Cadastrou usuário', user_update: 'Alterou usuário', user_password_reset: 'Redefiniu senha de usuário',
  company_update: 'Alterou configurações', product_create: 'Cadastrou produto', product_update: 'Editou produto', product_archive: 'Arquivou produto',
  lot_create: 'Cadastrou lote', lot_withdraw: 'Retirou lote', lot_archive: 'Arquivou lote', receipt_create: 'Registrou entrada de mercadoria',
  password_change: 'Alterou a própria senha', profile_update: 'Editou o perfil',
}

function AuditSection() {
  const { data } = useApi<{ items: { id: number; action: string; entity: string; entityId: number | null; createdAt: string; user: string | null }[] }>(
    ['audit'], '/api/audit', {},
  )
  return (
    <section className="space-y-2.5">
      <h2 className="text-lg font-semibold">Atividade recente</h2>
      {!data ? <Loading /> : (
        <ol className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white text-sm ring-1 ring-stone-200">
          {data.items.map((a) => (
            <li key={a.id} className="px-4 py-2.5">
              <p className="font-bold">{ACTIONS[a.action] ?? a.action}{a.entityId ? ` #${a.entityId}` : ''}</p>
              <p className="text-xs text-stone-500">{a.user ?? 'Sistema'} · {formatDateTime(a.createdAt)}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
