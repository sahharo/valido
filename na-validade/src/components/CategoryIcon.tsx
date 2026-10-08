import {
  Apple, Beef, Croissant, CupSoda, Ham, Milk, Package, ShoppingBasket, Snowflake, Sparkles, SprayCan,
  type LucideIcon,
} from 'lucide-react'

// Maps each product category to an icon (neutral gray: color is reserved for expiry status).
const MAP: Record<string, { icon: LucideIcon }> = {
  'Laticínios': { icon: Milk },
  Padaria: { icon: Croissant },
  Frios: { icon: Ham },
  Carnes: { icon: Beef },
  Bebidas: { icon: CupSoda },
  Mercearia: { icon: ShoppingBasket },
  Hortifruti: { icon: Apple },
  Congelados: { icon: Snowflake },
  Higiene: { icon: Sparkles },
  Limpeza: { icon: SprayCan },
}

export function CategoryIcon({ category, size = 'md' }: { category: string; size?: 'md' | 'lg' }) {
  const Icon = MAP[category]?.icon ?? Package
  const box = size === 'lg' ? 'h-14 w-14 rounded-xl' : 'h-11 w-11 rounded-xl'
  return (
    <div className={`${box} grid bg-stone-100 text-stone-500 shrink-0 place-items-center`}>
      <Icon className={size === 'lg' ? 'h-7 w-7' : 'h-5 w-5'} />
    </div>
  )
}
