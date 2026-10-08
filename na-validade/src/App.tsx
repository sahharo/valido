import { useEffect, useState } from 'react'
import { BarChart3, House, ListChecks, LogOut, ScanLine, Settings } from 'lucide-react'
import { ROLE_LABEL } from '../shared/domain.ts'
import { post } from './api.ts'
import { LotSheetProvider } from './components/LotSheets.tsx'
import { NotificationsBell } from './components/Notifications.tsx'
import { ErrorBox, Loading } from './components/ui.tsx'
import { queryClient, setMe, useCan, useMe } from './queries.ts'
import type { Me } from './types.ts'
import { greeting } from './utils.ts'
import { AuthView } from './views/AuthView.tsx'
import { Dashboard } from './views/Dashboard.tsx'
import { LotsView, type LotFilter } from './views/LotsView.tsx'
import { OnboardingStores } from './views/OnboardingStores.tsx'
import { ReportsView } from './views/ReportsView.tsx'
import { ScanView } from './views/ScanView.tsx'
import { SettingsView } from './views/SettingsView.tsx'

type Tab = 'inicio' | 'lotes' | 'scan' | 'relatorios' | 'ajustes'
const STORE_KEY = 'na-validade:store'

async function logout() {
  await post('/api/auth/logout').catch(() => {})
  // Sets the session to null first so the mounted "me" observer re-renders, then drops cached company data.
  setMe(null)
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
}

// Root: session check -> login/sign-up -> store onboarding -> main app.
export default function App() {
  const { data: me, error, refetch } = useMe()
  if (error) return <div className="mx-auto max-w-lg p-6 pt-20"><ErrorBox error={error} onRetry={refetch} /></div>
  if (me === undefined) return <div className="pt-32"><Loading /></div>
  if (!me) return <AuthView onAuth={setMe} />
  if (!me.stores.length) {
    if (me.permissions.includes('stores:manage')) return <OnboardingStores user={me.user} onLogout={logout} />
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 pt-24 text-center">
        <p className="text-xl font-semibold">Olá, {me.user.firstName}!</p>
        <p className="text-stone-600">Você ainda não tem acesso a nenhuma loja. Peça ao administrador da sua empresa para liberar.</p>
        <button onClick={logout} className="mx-auto flex items-center gap-2 font-bold text-stone-500"><LogOut className="h-4 w-4" /> Sair</button>
      </div>
    )
  }
  return (
    <LotSheetProvider>
      <MainApp me={me} />
    </LotSheetProvider>
  )
}

function MainApp({ me }: { me: Me }) {
  const can = useCan()
  const [tab, setTab] = useState<Tab>('inicio')
  const [filter, setFilter] = useState<LotFilter>('active')
  const [picked, setPicked] = useState<number | 'all'>(() => {
    const v = localStorage.getItem(STORE_KEY)
    return v && v !== 'all' ? Number(v) : 'all'
  })
  // Falls back to "all" if the remembered store is no longer accessible.
  const storeId = picked !== 'all' && me.stores.some((s) => s.id === picked) ? picked : 'all'
  const showReports = can('reports:view')
  const current = tab === 'relatorios' && !showReports ? 'inicio' : tab

  // Braces matter: newer Chrome versions make scrollTo return a Promise, and React
  // would treat a returned value as the effect cleanup ("destroy is not a function").
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [current])

  function pickStore(v: number | 'all') {
    setPicked(v)
    localStorage.setItem(STORE_KEY, String(v))
  }

  // Short pt-BR date like "Quarta, 7 de outubro".
  const [today] = useState(() => {
    const raw = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace('-feira', '')
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  })

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 pb-24 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="mb-5 space-y-3">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold leading-tight">{greeting()}, {me.user.firstName}!</p>
            <p className="truncate text-xs font-semibold text-stone-500">{today} · {ROLE_LABEL[me.user.role]}</p>
          </div>
          <NotificationsBell />
        </div>
        {current !== 'ajustes' && current !== 'scan' && me.stores.length > 1 && (
          <label className="flex items-center gap-2">
            <span className="text-sm font-medium text-stone-500">Loja:</span>
            <select
              value={storeId}
              onChange={(e) => pickStore(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-200 outline-none"
            >
              <option value="all">Todas as lojas</option>
              {me.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </header>

      <main key={current} className="animate-pop">
        {current === 'inicio' && <Dashboard storeId={storeId} onOpenFilter={(f) => { setFilter(f); setTab('lotes') }} />}
        {current === 'lotes' && <LotsView storeId={storeId} filter={filter} setFilter={setFilter} />}
        {current === 'scan' && <ScanView stores={me.stores} defaultStoreId={storeId} />}
        {current === 'relatorios' && <ReportsView storeId={storeId} />}
        {current === 'ajustes' && <SettingsView me={me} onLogout={logout} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-lg items-end justify-around px-2 pb-2 pt-1.5">
          <NavBtn active={current === 'inicio'} onClick={() => setTab('inicio')} icon={House} label="Início" />
          <NavBtn active={current === 'lotes'} onClick={() => { setFilter('active'); setTab('lotes') }} icon={ListChecks} label="Lotes" />
          <button
            onClick={() => setTab('scan')}
            aria-label="Escanear produto"
            aria-current={current === 'scan' ? 'page' : undefined}
            className="mx-1 -mt-7 grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-500 text-white ring-4 ring-paper transition active:scale-95"
          >
            <ScanLine className="h-8 w-8" />
          </button>
          {showReports && <NavBtn active={current === 'relatorios'} onClick={() => setTab('relatorios')} icon={BarChart3} label="Relatórios" />}
          <NavBtn active={current === 'ajustes'} onClick={() => setTab('ajustes')} icon={Settings} label="Ajustes" />
        </div>
      </nav>
    </div>
  )
}

function NavBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof House; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-1 text-xs font-medium transition ${active ? 'text-brand-600' : 'text-stone-500'}`}
    >
      <Icon className="h-6 w-6" />
      {label}
    </button>
  )
}
