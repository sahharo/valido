import { ChevronRight, PackageMinus } from 'lucide-react'
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

export function ProductThumb({ product, size = 'md' }: { product: LotItem['product']; size?: 'md' | 'lg' }) {
  if (product.imageUrl)
    return (
      <img
        src={product.imageUrl}
        alt=""
        className={`${size === 'lg' ? 'h-14 w-14 rounded-xl' : 'h-11 w-11 rounded-xl'} shrink-0 bg-white object-contain ring-1 ring-stone-200`}
      />
    )
  return <CategoryIcon category={product.category} size={size} />
}

// Card showing a single lot with its expiry status and quick actions.
export function LotCard({ lot, onOpen, onWithdraw }: { lot: LotItem; onOpen?: () => void; onWithdraw?: () => void }) {
  const meta = STATUS_META[lotStatus(lot)]
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-xl bg-white p-3 pl-4 ring-1 ring-stone-200">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${meta.bar}`} />
      <button onClick={onOpen} disabled={!onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Ver lote de ${lot.product.name}`}>
        <ProductThumb product={lot.product} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-stone-800">{lot.product.name}</p>
          <p className="truncate text-xs text-stone-500">
            {lot.store.name}
            {lot.lotNumber && ` · Lote ${lot.lotNumber}`} · {formatQty(lot.quantity, lot.product.unit)} · {formatDate(lot.expiryDate)}
          </p>
          <span className="mt-1 inline-block"><StatusBadge lot={lot} /></span>
        </div>
        {onOpen && !onWithdraw && <ChevronRight className="h-5 w-5 shrink-0 text-stone-300" />}
      </button>
      {onWithdraw && lot.status === 'active' && (
        <button
          onClick={onWithdraw}
          className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-2.5 py-2 text-[11px] font-semibold text-stone-700 ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-95"
        >
          <PackageMinus className="h-4 w-4" /> Retirar
        </button>
      )}
    </div>
  )
}
