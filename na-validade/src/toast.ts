// Global toast messages (same listener pattern as confirm.ts).
export type Toast = { message: string; kind: 'success' | 'error' }
type Listener = (t: Toast) => void
let listener: Listener | null = null

export function subscribeToast(l: Listener) {
  listener = l
  return () => {
    if (listener === l) listener = null
  }
}
export const toast = (message: string, kind: Toast['kind'] = 'success') => listener?.({ message, kind })
