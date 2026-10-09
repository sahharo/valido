import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, UserRound, X } from 'lucide-react'
import { JOB_TITLES, ROLE_LABEL, ROLES, type Role } from '../../shared/domain.ts'
import { isStrongPassword, isValidCPF, isValidEmail, isValidPhone, maskCPF, maskPhone } from '../../shared/validation.ts'
import { api, patch, post } from '../api.ts'
import { Chips, Field, FormError, inputCls, PasswordInput, PasswordRules, PrimaryButton, Toggle } from '../components/ui.tsx'
import { queryClient, setMe } from '../queries.ts'
import { personValid, toPersonDraft, type PersonDraft } from '../personDraft.ts'
import { toast } from '../toast.ts'
import type { CompanyUser, Me, StoreInfo } from '../types.ts'

const ROLE_HELP: Record<Role, string> = {
  admin: 'Acesso total: lojas, usuários, relatórios, configurações e arquivamento.',
  manager: 'Cadastra produtos e lotes, marca retiradas e vê relatórios das suas lojas.',
  employee: 'Escaneia, cadastra lotes e marca retiradas nas suas lojas.',
}
type JobTitle = (typeof JOB_TITLES)[number]
const reload = () => queryClient.invalidateQueries({ queryKey: ['users'] })

// Name, e-mail (the login), phone and job title: used by "Editar meus dados" and by the admin when editing the team.
export function PersonFields({ value: f, onChange }: { value: PersonDraft; onChange: (v: PersonDraft) => void }) {
  const set = <K extends keyof PersonDraft>(k: K, v: PersonDraft[K]) => onChange({ ...f, [k]: v })
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome" error={f.firstName.trim().length < 2 ? 'Informe o nome' : undefined}>
          <input className={inputCls} value={f.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="given-name" />
        </Field>
        <Field label="Sobrenome" error={f.lastName.trim().length < 2 ? 'Informe o sobrenome' : undefined}>
          <input className={inputCls} value={f.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="family-name" />
        </Field>
      </div>
      <Field label="E-mail" hint="É com este e-mail que se entra no app." error={!isValidEmail(f.email) ? 'E-mail inválido' : undefined}>
        <input className={inputCls} type="email" value={f.email} onChange={(e) => set('email', e.target.value.trim())} autoCapitalize="none" />
      </Field>
      <Field label="Telefone / WhatsApp" error={!isValidPhone(f.phone) ? 'Telefone inválido' : undefined}>
        <input className={inputCls} inputMode="tel" value={f.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} placeholder="(11) 98765-4321" />
      </Field>
      <div className="space-y-1.5">
        <span className="pl-1 text-sm font-bold text-ink-2">Cargo</span>
        <Chips options={JOB_TITLES} value={f.jobTitle} onChange={(v) => set('jobTitle', v)} />
      </div>
    </>
  )
}

// Admin-only team management: create users, choose role and which stores they can access.
export function UsersSection({ stores, currentUserId }: { stores: StoreInfo[]; currentUserId: number }) {
  const { data } = useQuery({ queryKey: ['users'], queryFn: () => api<{ items: CompanyUser[] }>('/api/users') })
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  // Search by name or e-mail, ignoring accents and case.
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const shown = data?.items.filter((u) => norm(`${u.firstName} ${u.lastName} ${u.email}`).includes(norm(search.trim())))
  const storeName = new Map(stores.map((s) => [s.id, s.name]))

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Equipe ({data?.items.length ?? '…'})</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-sm font-bold text-on-brand">
            <Plus className="h-4 w-4" /> Adicionar
          </button>
        )}
      </div>
      {adding && <NewUserForm stores={stores} onClose={() => setAdding(false)} />}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" aria-hidden />
        <input className={`${inputCls} pl-12`} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar na equipe" />
      </div>
      {shown?.length === 0 && <p className="py-4 text-center text-sm text-ink-2">Ninguém encontrado com "{search}".</p>}
      {shown?.map((u) =>
        editing === u.id ? (
          <EditUserForm key={u.id} user={u} stores={stores} self={u.id === currentUserId} onClose={() => setEditing(null)} />
        ) : (
          <button key={u.id} onClick={() => setEditing(u.id)} className="flex w-full items-center gap-3 rounded-xl bg-card p-4 text-left ring-1 ring-line">
            <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full font-semibold ${u.active ? 'bg-surface text-brand' : 'bg-surface text-ink-3'}`}>
              {`${u.firstName[0]}${u.lastName[0]}`.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{u.firstName} {u.lastName}{u.id === currentUserId && ' (você)'}</p>
              <p className="truncate text-xs text-ink-2">
                {ROLE_LABEL[u.role]} · {u.jobTitle} · {u.role === 'admin' ? 'todas as lojas' : u.storeIds.map((id) => storeName.get(id)).filter(Boolean).join(', ') || 'nenhuma loja'}
              </p>
            </div>
            {!u.active && <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-ink-2">Inativo</span>}
          </button>
        ),
      )}
    </section>
  )
}

function RolePicker({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div className="space-y-1.5">
      <span className="pl-1 text-sm font-bold text-ink-2">Perfil de acesso</span>
      <Chips options={ROLES} value={value} onChange={onChange} labels={ROLE_LABEL} />
      <p className="pl-1 text-xs text-ink-2">{ROLE_HELP[value]}</p>
    </div>
  )
}

function StorePicker({ stores, value, onChange, role }: { stores: StoreInfo[]; value: number[]; onChange: (ids: number[]) => void; role: Role }) {
  if (role === 'admin') return <p className="pl-1 text-sm text-ink-2">Administradores acessam todas as lojas.</p>
  return (
    <div className="space-y-1.5">
      <span className="pl-1 text-sm font-bold text-ink-2">Lojas que pode acessar</span>
      <div className="space-y-1.5">
        {stores.map((s) => (
          <label key={s.id} className="flex items-center gap-3 rounded-xl bg-surface p-3 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand"
              checked={value.includes(s.id)}
              onChange={(e) => onChange(e.target.checked ? [...value, s.id] : value.filter((id) => id !== s.id))}
            />
            {s.name}
          </label>
        ))}
      </div>
    </div>
  )
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="animate-pop space-y-3 rounded-2xl bg-card p-4 ring-1 ring-line">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-semibold"><UserRound className="h-5 w-5 text-brand" /> {title}</p>
        <button onClick={onClose} aria-label="Fechar" className="text-ink-3"><X className="h-5 w-5" /></button>
      </div>
      {children}
    </div>
  )
}

function NewUserForm({ stores, onClose }: { stores: StoreInfo[]; onClose: () => void }) {
  const [f, setF] = useState({
    firstName: '', lastName: '', email: '', phone: '', document: '', jobTitle: 'Repositor(a)' as JobTitle,
    role: 'employee' as Role, storeIds: stores.length === 1 ? [stores[0].id] : ([] as number[]), password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const valid =
    f.firstName.trim().length >= 2 && f.lastName.trim().length >= 2 && isValidEmail(f.email) && isValidPhone(f.phone) &&
    (!f.document || isValidCPF(f.document)) && isStrongPassword(f.password) && (f.role === 'admin' || f.storeIds.length > 0)

  async function submit() {
    setLoading(true)
    setError('')
    try {
      await post('/api/users', { ...f, storeIds: f.role === 'admin' ? [] : f.storeIds })
      await reload()
      toast('Usuário cadastrado')
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Panel title="Novo usuário" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome"><input className={inputCls} value={f.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
        <Field label="Sobrenome"><input className={inputCls} value={f.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
      </div>
      <Field label="E-mail" hint="A pessoa entra no app com este e-mail." error={f.email && !isValidEmail(f.email) ? 'E-mail inválido' : undefined}>
        <input className={inputCls} type="email" value={f.email} onChange={(e) => set('email', e.target.value.trim())} autoCapitalize="none" />
      </Field>
      <Field label="Telefone / WhatsApp"><input className={inputCls} inputMode="tel" value={f.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} placeholder="(11) 98765-4321" /></Field>
      {/* Login is by e-mail only; CPF is optional team info. */}
      <Field label="CPF (opcional)" error={f.document.length === 14 && !isValidCPF(f.document) ? 'CPF inválido' : undefined}>
        <input className={inputCls} inputMode="numeric" value={f.document} onChange={(e) => set('document', maskCPF(e.target.value))} placeholder="000.000.000-00" />
      </Field>
      <div className="space-y-1.5">
        <span className="pl-1 text-sm font-bold text-ink-2">Cargo</span>
        <Chips options={JOB_TITLES} value={f.jobTitle} onChange={(v) => set('jobTitle', v)} />
      </div>
      <RolePicker value={f.role} onChange={(r) => set('role', r)} />
      <StorePicker stores={stores} value={f.storeIds} onChange={(ids) => set('storeIds', ids)} role={f.role} />
      <Field label="Senha inicial" hint="Mínimo de 8 caracteres. Entregue à pessoa; ela pode trocar depois em Ajustes.">
        <PasswordInput value={f.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
        <PasswordRules value={f.password} />
      </Field>
      <FormError message={error} />
      <PrimaryButton loading={loading} disabled={!valid} onClick={submit}>Cadastrar usuário</PrimaryButton>
    </Panel>
  )
}

function EditUserForm({ user, stores, self, onClose }: { user: CompanyUser; stores: StoreInfo[]; self: boolean; onClose: () => void }) {
  const [person, setPerson] = useState(() => toPersonDraft(user))
  const [role, setRole] = useState(user.role)
  const [storeIds, setStoreIds] = useState(user.storeIds)
  const [active, setActive] = useState(user.active)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function save() {
    setLoading(true)
    setError('')
    try {
      await patch(`/api/users/${user.id}`, { ...person, ...(self ? { storeIds } : { role, storeIds: role === 'admin' ? [] : storeIds, active }) })
      if (self) setMe(await api<Me>('/api/auth/me'))
      if (password) await post(`/api/users/${user.id}/password`, { password })
      await reload()
      toast('Usuário atualizado')
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Panel title={`${user.firstName} ${user.lastName}`} onClose={onClose}>
      <PersonFields value={person} onChange={setPerson} />
      {self ? (
        <p className="rounded-xl bg-surface p-3 text-sm text-ink-2">Você não pode alterar o próprio perfil de acesso nem se desativar.</p>
      ) : (
        <>
          <RolePicker value={role} onChange={setRole} />
          <StorePicker stores={stores} value={storeIds} onChange={setStoreIds} role={role} />
          <Toggle checked={active} onChange={setActive} label="Acesso ativo" description="Desativar encerra as sessões da pessoa e bloqueia o login." />
        </>
      )}
      {!self && (
        <Field label="Redefinir senha (opcional)" hint="Deixe em branco para manter a senha atual.">
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          {password && <PasswordRules value={password} />}
        </Field>
      )}
      <FormError message={error} />
      <PrimaryButton loading={loading} disabled={!personValid(person) || (password.length > 0 && !isStrongPassword(password)) || (role !== 'admin' && !storeIds.length)} onClick={save}>
        Salvar alterações
      </PrimaryButton>
    </Panel>
  )
}
