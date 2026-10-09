import type { CompanySettings, Permission, Role, WithdrawalReason } from '../shared/domain.ts'
import type { ExpiryStatus } from '../shared/status.ts'

// Shapes returned by the API.
export interface StoreInfo {
  id: number
  name: string
  cnpj: string | null
  city: string | null
  uf: string | null
  address: string | null
  addressNumber: string | null
  cep: string | null
}

export interface Me {
  user: {
    id: number
    firstName: string
    lastName: string
    email: string
    phone: string
    document: string | null
    documentType: 'cpf' | 'cnpj' | null
    jobTitle: string
    role: Role
    createdAt: string
  }
  company: { id: number; name: string; settings: CompanySettings }
  permissions: Permission[]
  stores: StoreInfo[]
}

export interface ProductInfo {
  id: number
  barcode: string
  name: string
  brand: string | null
  category: string
  unit: string
  imageUrl: string | null
  costPrice: number | null
}

export interface LotItem {
  id: number
  lotNumber: string | null
  quantity: number
  initialQuantity: number
  expiryDate: string
  unitCost: number | null
  notes: string | null
  status: 'active' | 'withdrawn' | 'archived'
  source: string
  createdAt: string
  withdrawnAt: string | null
  withdrawalReason: WithdrawalReason | null
  promoSince: string | null
  promoDiscount: number | null
  daysLeft: number
  expiry: ExpiryStatus
  product: ProductInfo
  store: { id: number; name: string }
}

export interface Movement {
  id: number
  type: 'entry' | 'withdrawal' | 'archive'
  quantity: number
  reason: WithdrawalReason | null
  unitCost: number | null
  totalCost: number | null
  notes: string | null
  createdAt: string
  user: string
}

export interface Counts {
  expired: number
  week: number
  month: number
  ok: number
}
export type StoreCounts = Counts & { storeId: number; name: string }
export interface Totals {
  count?: number
  quantity: number
  value: number
}

export interface DashboardData {
  counts: Counts
  byStore: StoreCounts[]
  attention: LotItem[]
  upcoming: LotItem[]
  losses: { from: string; to: string; total: Totals; expired: Totals } | null
}

export interface ReportData {
  period: { from: string; to: string }
  losses: {
    total: Totals
    byReason: (Totals & { reason: WithdrawalReason })[]
    byProduct: (Totals & { productId: number; name: string; category: string })[]
    byCategory: (Totals & { category: string })[]
    byStore: (Totals & { storeId: number; name: string; expiredCount: number })[]
  }
  history: {
    id: number; createdAt: string; reason: WithdrawalReason; quantity: number; totalCost: number | null; notes: string | null
    lotId: number; lotNumber: string | null; expiryDate: string; product: string; barcode: string; category: string
    unit: string; store: string; user: string
  }[]
  atRisk: { productId: number; name: string; category: string; unit: string; lots: number; quantity: number; value: number; nextExpiry: string; stores: string }[]
  validity: { counts: Counts; byStore: StoreCounts[] }
  avoided: { count: number; quantity: number; value: number; missingCost: number }
  monthly: { month: string; quantity: number; value: number }[]
  hasCosts: boolean
}

export interface NotificationItem {
  id: number
  type: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  body: string
  storeId: number | null
  createdAt: string
  read: boolean
}

export interface CompanyUser {
  id: number
  firstName: string
  lastName: string
  email: string
  phone: string
  jobTitle: string
  role: Role
  active: boolean
  lastLoginAt: string | null
  storeIds: number[]
}

export interface ExternalSuggestion {
  name: string
  brand: string | null
  category: string | null
  unit: string | null
  imageUrl: string | null
  source: string
}
