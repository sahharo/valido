// Expiry status rules shared by the API and the web app, so both always classify lots the same way.
export type ExpiryStatus = 'expired' | 'week' | 'month' | 'ok'

export const WEEK_DAYS = 7
export const MONTH_DAYS = 30

export function expiryStatus(daysLeft: number): ExpiryStatus {
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= WEEK_DAYS) return 'week'
  if (daysLeft <= MONTH_DAYS) return 'month'
  return 'ok'
}
