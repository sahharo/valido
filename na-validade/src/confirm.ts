// In-app replacement for window.confirm/alert, which are blocked in some
// browsers and embedded previews (that is why "apagar lotes" did nothing).
export interface ConfirmRequest {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  // Shows only an "OK" button (works like alert).
  alertOnly?: boolean
}

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void }
type Listener = (p: Pending | null) => void

let listener: Listener | null = null

export function subscribeConfirm(l: Listener) {
  listener = l
  return () => {
    if (listener === l) listener = null
  }
}

export function askConfirm(req: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    if (!listener) return resolve(false)
    listener({ ...req, resolve })
  })
}

export const showAlert = (title: string, message?: string) =>
  askConfirm({ title, message, alertOnly: true }).then(() => undefined)
