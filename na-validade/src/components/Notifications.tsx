import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Bell, BellOff, Clock, Info } from 'lucide-react'
import { api, post } from '../api.ts'
import { queryClient } from '../queries.ts'
import type { NotificationItem } from '../types.ts'
import { formatDateTime } from '../utils.ts'
import { EmptyState, Sheet } from './ui.tsx'

const ICON = { critical: AlertTriangle, warning: Clock, info: Info }
const CLS = { critical: 'bg-rose-100 text-rose-600', warning: 'bg-orange-100 text-orange-600', info: 'bg-sky-100 text-sky-600' }

// In-app alerts (bell in the header).
export function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: NotificationItem[]; unread: number }>('/api/notifications'),
    refetchInterval: 5 * 60_000,
  })
  const unread = data?.unread ?? 0

  async function markAll() {
    await post('/api/notifications/read')
    await queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={unread ? `Avisos: ${unread} não lidos` : 'Avisos'}
        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-stone-600 ring-1 ring-stone-200"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <Sheet title="Avisos" onClose={() => setOpen(false)}>
          {!data?.items.length ? (
            <EmptyState icon={BellOff} title="Nenhum aviso por enquanto" text="Os alertas de vencimento aparecem aqui." />
          ) : (
            <div className="space-y-2">
              {unread > 0 && (
                <button onClick={markAll} className="mb-1 text-sm font-bold text-brand-600">Marcar todos como lidos</button>
              )}
              {data.items.map((n) => {
                const Icon = ICON[n.severity]
                return (
                  <div key={n.id} className={`flex gap-3 rounded-xl bg-white p-3 ring-1 ${n.read ? 'ring-stone-100' : 'ring-1 ring-stone-200'}`}>
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${CLS[n.severity]}`}><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <p className="font-bold leading-tight">{n.title}</p>
                      <p className="text-sm text-stone-600">{n.body}</p>
                      <p className="mt-0.5 text-xs text-stone-400">{formatDateTime(n.createdAt)}{!n.read && ' · novo'}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Sheet>
      )}
    </>
  )
}
