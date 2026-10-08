import type { z } from 'zod'

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = 'error',
    public details?: unknown,
  ) {
    super(message)
  }
}

export const badRequest = (message: string, code = 'bad_request') => new HttpError(400, message, code)
export const unauthorized = () => new HttpError(401, 'Sua sessão expirou. Entre novamente.', 'unauthorized')
export const forbidden = (message = 'Você não tem permissão para esta ação.') => new HttpError(403, message, 'forbidden')
export const notFound = (message = 'Registro não encontrado.', code = 'not_found') => new HttpError(404, message, code)
export const conflict = (message: string, code = 'conflict', details?: unknown) => new HttpError(409, message, code, details)

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
  throw new HttpError(400, issues[0]?.message ?? 'Dados inválidos.', 'validation', issues)
}
