import { z } from 'zod'
import { barcodeError } from '../../../shared/validation.ts'

export const idParam = z.object({ id: z.coerce.number().int().positive() })
export const optionalId = z.coerce.number().int().positive().optional()
export const isoDate = z.iso.date('Data inválida.')
export const barcode = z
  .string()
  .trim()
  .superRefine((v, ctx) => {
    const err = barcodeError(v)
    if (err) ctx.addIssue({ code: 'custom', message: err })
  })
export const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => v || null)
export const money = z.coerce.number().min(0, 'Valor inválido.').max(1_000_000).multipleOf(0.01).nullable().optional()
export const quantity = z.coerce.number().positive('A quantidade deve ser maior que zero.').max(1_000_000).multipleOf(0.001)
