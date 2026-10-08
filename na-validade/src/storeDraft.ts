import { isValidCNPJ, onlyDigits } from '../shared/validation.ts'

// Store form draft helpers: empty value, validation and conversion to the API payload.
export interface StoreDraft {
  name: string
  cnpj: string
  city: string
  uf: string
  address: string
  addressNumber: string
  cep: string
}

export const emptyStore = (): StoreDraft => ({ name: '', cnpj: '', city: '', uf: '', address: '', addressNumber: '', cep: '' })

// CNPJ, address, street number and city are required (same rules as the server).
export function storeErrors(d: StoreDraft) {
  const e: Partial<Record<keyof StoreDraft, string>> = {}
  if (d.name.trim().length < 2) e.name = 'Informe o nome da loja'
  if (!d.cnpj) e.cnpj = 'Informe o CNPJ da loja'
  else if (!isValidCNPJ(d.cnpj)) e.cnpj = 'CNPJ inválido'
  // CEP is optional, but when typed it must have 8 digits.
  if (d.cep && onlyDigits(d.cep).length !== 8) e.cep = 'CEP inválido'
  if (!d.address.trim()) e.address = 'Informe o endereço'
  if (!d.addressNumber.trim()) e.addressNumber = 'Informe o número'
  if (!d.city.trim()) e.city = 'Informe a cidade'
  return e
}

export function draftToStore(d: StoreDraft) {
  return {
    name: d.name.trim(),
    cnpj: onlyDigits(d.cnpj),
    city: d.city.trim(),
    uf: d.uf || null,
    address: d.address.trim(),
    addressNumber: d.addressNumber.trim(),
    cep: onlyDigits(d.cep) || null,
  }
}
