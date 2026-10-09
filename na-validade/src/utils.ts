import { AlertTriangle, CalendarClock, CircleCheck, Clock, Archive, PackageCheck, type LucideIcon } from 'lucide-react'
import type { ExpiryStatus } from '../shared/status.ts'
import type { LotItem } from './types.ts'

export { CATEGORIES, UNITS, type Category } from '../shared/domain.ts'

// Date, number and status display helpers.
const DAY = 86_400_000

function todayLocal() {
  const t = new Date()
  return new Date(t.getFullYear(), t.getMonth(), t.getDate())
}

export function isoInDays(n: number) {
  const d = new Date(todayLocal().getTime() + n * DAY)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysUntil(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round((new Date(y, m - 1, d).getTime() - todayLocal().getTime()) / DAY)
}

type DisplayStatus = ExpiryStatus | 'withdrawn' | 'archived'

// Color only for urgency (red = expired, amber = this week); later expiries stay neutral, and every status also has an icon and a text label.
export const STATUS_META: Record<DisplayStatus, { label: string; badge: string; bar: string; icon: LucideIcon }> = {
  expired: { label: 'Vencido', badge: 'bg-danger-bg text-danger', bar: 'bg-danger', icon: AlertTriangle },
  week: { label: 'Até 7 dias', badge: 'bg-warning-bg text-warning', bar: 'bg-warning', icon: Clock },
  month: { label: 'Até 30 dias', badge: 'bg-surface text-ink-2', bar: 'bg-ink-3/40', icon: CalendarClock },
  ok: { label: 'Em dia', badge: 'bg-surface text-ink-3', bar: 'bg-line', icon: CircleCheck },
  withdrawn: { label: 'Retirado', badge: 'bg-surface text-ink-2', bar: 'bg-ink-3/40', icon: PackageCheck },
  archived: { label: 'Arquivado', badge: 'bg-surface text-ink-2', bar: 'bg-surface', icon: Archive },
}

export const lotStatus = (l: LotItem): DisplayStatus => (l.status === 'active' ? l.expiry : l.status)

export function relativeLabel(days: number) {
  if (days < -1) return `Venceu há ${-days} dias`
  if (days === -1) return 'Venceu ontem'
  if (days === 0) return 'Vence hoje'
  if (days === 1) return 'Vence amanhã'
  return `Vence em ${days} dias`
}

export function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const formatMoney = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatQty = (q: number, unit = 'un') => `${q.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${unit}`

export function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

// Excel-friendly CSV (";" separator, UTF-8 BOM).
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (c: string | number | null | undefined) => `"${String(c ?? '').replace(/"/g, '""')}"`
  const csv = [header, ...rows].map((r) => r.map(cell).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
