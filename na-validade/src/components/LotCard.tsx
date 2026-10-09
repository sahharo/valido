import { ChevronRight, PackageMinus, Tag } from 'lucide-react'
import type { LotItem } from '../types.ts'
import { formatDate, formatQty, lotStatus, relativeLabel, STATUS_META } from '../utils.ts'
import { CategoryIcon } from './CategoryIcon.tsx'

// Status shown with color, icon and text, so it never depends on color alone.
export function StatusBadge({ lot, short }: { lot: LotItem; short?: boolean }) {
  const meta = STATUS_META[lotStatus(lot)]
  const Icon = meta.icon
  const text = lot.status === 'active' && !short ? relativeLabel(lot.daysLeft) : meta.label
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.badge}`}>
      <Icon className="h-3 w-3" aria-hidden /> {text}
    </span>
  )
}

// Peach tag for lots marked down to sell before expiring.
export function PromoBadge({ lot }: { lot: LotItem }) {
  if (!lot.promoSince || lot.status !== 'active') return null
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent">
      <Tag className="h-3 w-3" aria-hidden /> Em promoção{lot.promoDiscount ? ` · ${lot.promoDiscount}%` : ''}
    </span>
  )
}

export function ProductThumb({ product, size = 'md' }: { product: LotItem['product']; size?: 'md' | 'lg' }) {
  if (product.imageUrl)
    return (
      <img
        src={product.imageUrl}
        alt=""
        className={`${size === 'lg' ? 'h-14 w-14 rounded-xl' : 'h-11 w-11 rounded-xl'} shrink-0 bg-card object-contain ring-1 ring-line`}
      />
    )
  return <CategoryIcon category={product.category} size={size} />
}

// Card showing a single lot with its expiry status and quick actions.
export function LotCard({ lot, onOpen, onWithdraw }: { lot: LotItem; onOpen?: () => void; onWithdraw?: () => void }) {
  const meta = STATUS_META[lotStatus(lot)]
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-xl bg-card p-3 pl-4 ring-1 ring-line">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${meta.bar}`} />
      <button onClick={onOpen} disabled={!onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Ver lote de ${lot.product.name}`}>
        <ProductThumb product={lot.product} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink">{lot.product.name}</p>
          <p className="truncate text-xs text-ink-2">
            {lot.store.name}
            {lot.lotNumber && ` · Lote ${lot.lotNumber}`} · {formatQty(lot.quantity, lot.product.unit)} · {formatDate(lot.expiryDate)}
          </p>
          <span className="mt-1 flex flex-wrap gap-1"><StatusBadge lot={lot} /><PromoBadge lot={lot} /></span>
        </div>
        {onOpen && !onWithdraw && <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />}
      </button>
      {onWithdraw && lot.status === 'active' && (
        <button
          onClick={onWithdraw}
          className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-2.5 py-2 text-[11px] font-semibold text-ink ring-1 ring-line transition hover:bg-surface active:scale-95"
        >
          <PackageMinus className="h-4 w-4" /> Retirar
        </button>
      )}
    </div>
  )
}
