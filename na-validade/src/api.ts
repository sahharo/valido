// HTTP client for the Validei API. The session lives in an HttpOnly cookie; mutations send the
// X-Requested-With header the API requires as CSRF protection.
export class ApiError extends Error {
  status: number
  code: string
  details?: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

type Method = 'GET' | 'POST' | 'PATCH'

export async function api<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
  const isGet = method === 'GET'
  let res: Response
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: isGet ? {} : { 'Content-Type': 'application/json', 'X-Requested-With': 'navalidade' },
      body: isGet ? undefined : JSON.stringify(body ?? {}),
    })
  } catch {
    throw new ApiError(0, 'network', 'Sem conexão com o servidor. Verifique a internet e tente de novo.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? 'Algo deu errado. Tente de novo.', data?.details)
  return data as T
}

export const post = <T>(path: string, body?: unknown) => api<T>(path, 'POST', body)
export const patch = <T>(path: string, body?: unknown) => api<T>(path, 'PATCH', body)

export function qs(params: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}
