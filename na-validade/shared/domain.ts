// Domain constants shared by the API and the web app.
export const ROLES = ['admin', 'manager', 'employee'] as const
export type Role = (typeof ROLES)[number]
export const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', manager: 'Gerente', employee: 'Funcionário' }

export const PERMISSIONS = [
  'stores:manage', 'users:manage', 'products:write', 'lots:write', 'lots:withdraw',
  'reports:view', 'settings:manage', 'records:archive',
] as const
export type Permission = (typeof PERMISSIONS)[number]

// Base permissions per role. "products:write" may also be granted to employees by a company setting.
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  manager: ['products:write', 'lots:write', 'lots:withdraw', 'reports:view'],
  employee: ['lots:write', 'lots:withdraw'],
}

export const CATEGORIES = [
  'Laticínios', 'Padaria', 'Frios', 'Carnes', 'Bebidas', 'Mercearia',
  'Hortifruti', 'Congelados', 'Higiene', 'Limpeza', 'Outros',
] as const
export type Category = (typeof CATEGORIES)[number]

export const UNITS = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct', 'fardo'] as const
export type Unit = (typeof UNITS)[number]

export const WITHDRAWAL_REASONS = ['expired', 'damaged', 'returned', 'stock_adjustment', 'other', 'sold'] as const
export type WithdrawalReason = (typeof WITHDRAWAL_REASONS)[number]
export const REASON_LABEL: Record<WithdrawalReason, string> = {
  expired: 'Produto vencido',
  damaged: 'Produto danificado',
  returned: 'Produto devolvido',
  stock_adjustment: 'Ajuste de estoque',
  other: 'Outro',
  sold: 'Vendido em promoção',
}
// Reasons that count as a financial loss (a return to the supplier or a stock correction is not a loss).
export const LOSS_REASONS: readonly WithdrawalReason[] = ['expired', 'damaged', 'other']

export const JOB_TITLES = ['Proprietário(a)', 'Gerente', 'Encarregado(a)', 'Repositor(a)', 'Outro'] as const

export interface CompanySettings {
  employeesCanCreateProducts: boolean
}
export const DEFAULT_SETTINGS: CompanySettings = { employeesCanCreateProducts: false }
