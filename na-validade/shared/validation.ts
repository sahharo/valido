// Brazilian document/phone helpers: input masks and check-digit validation for CPF and CNPJ.
export const onlyDigits = (s: string) => s.replace(/\D/g, '')

// Applies a "#" pattern progressively, so the mask grows as the user types.
function applyPattern(digits: string, pattern: string) {
  let out = ''
  let i = 0
  for (const ch of pattern) {
    if (i >= digits.length) break
    out += ch === '#' ? digits[i++] : ch
  }
  return out
}

export const maskCPF = (v: string) => applyPattern(onlyDigits(v).slice(0, 11), '###.###.###-##')
export const maskCNPJ = (v: string) => applyPattern(onlyDigits(v).slice(0, 14), '##.###.###/####-##')

export function maskDocument(v: string) {
  const d = onlyDigits(v).slice(0, 14)
  return d.length <= 11 ? maskCPF(d) : maskCNPJ(d)
}

export function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11)
  return applyPattern(d, d.length <= 10 ? '(##) ####-####' : '(##) #####-####')
}

export function isValidCPF(v: string) {
  const c = onlyDigits(v)
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  for (const t of [9, 10]) {
    let sum = 0
    for (let i = 0; i < t; i++) sum += Number(c[i]) * (t + 1 - i)
    if (((sum * 10) % 11) % 10 !== Number(c[t])) return false
  }
  return true
}

export function isValidCNPJ(v: string) {
  const c = onlyDigits(v)
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const digit = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const r = weights.reduce((acc, w, i) => acc + Number(c[i]) * w, 0) % 11
    return r < 2 ? 0 : 11 - r
  }
  return digit(12) === Number(c[12]) && digit(13) === Number(c[13])
}

// Stricter e-mail check: valid local part, real-looking domain labels and a letters-only TLD.
const EMAIL_RE =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i
export const isValidEmail = (e: string) => {
  const t = e.trim()
  return t.length <= 254 && t.split('@')[0].length <= 64 && EMAIL_RE.test(t)
}

// Common typos of popular Brazilian e-mail domains -> correct domain.
const DOMAIN_FIXES: Record<string, string> = {
  'gmail.com.br': 'gmail.com', 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmal.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'hotmail.co': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'hotmai.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'outloo.com': 'outlook.com',
  'yahoo.com.b': 'yahoo.com.br', 'yaho.com.br': 'yahoo.com.br', 'yahoo.con.br': 'yahoo.com.br', 'yahoo.br': 'yahoo.com.br',
  'icloud.co': 'icloud.com', 'iclod.com': 'icloud.com', 'uol.com': 'uol.com.br', 'bol.com': 'bol.com.br',
}

// Suggests a corrected e-mail when the domain looks like a typo (e.g. "@gmial.com").
export function suggestEmail(e: string): string | null {
  const [user, domain] = e.trim().toLowerCase().split('@')
  const fix = domain && DOMAIN_FIXES[domain]
  return user && fix ? `${user}@${fix}` : null
}
// Brazilian area codes (DDD) in use, per Anatel.
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
])

// Brazilian phone with DDD: mobile = DDD + 9 + 8 digits; landline = DDD + [2-5] + 7 digits.
// Rejects unknown DDDs and placeholder numbers such as 90000-0000 or 3333-3333.
export function isValidPhone(p: string) {
  const d = onlyDigits(p)
  if (d.length !== 10 && d.length !== 11) return false
  if (!DDDS.has(Number(d.slice(0, 2)))) return false
  const local = d.slice(2)
  if (d.length === 11 ? local[0] !== '9' : !/^[2-5]/.test(local)) return false
  return !/^(\d)\1+$/.test(local.slice(1))
}

// Guesses what the user typed in the single login field: owners use the CNPJ, team members CPF or e-mail.
export type IdentifierKind = 'email' | 'cpf' | 'cnpj' | null

export function identifierKind(raw: string): IdentifierKind {
  const t = raw.trim()
  if (!t) return null
  if (/[a-z@]/i.test(t)) return 'email'
  const d = onlyDigits(t)
  if (d.length === 14) return 'cnpj'
  if (d.length === 11) return 'cpf'
  return null
}

// Masks the login field according to what is being typed (e-mail stays as is): CPF up to 11 digits, then CNPJ.
export function maskIdentifier(raw: string) {
  if (/[a-z@]/i.test(raw)) return raw
  return maskDocument(raw)
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

// GTIN check digit (EAN-8, UPC-A/GTIN-12, EAN-13, GTIN-14), as defined by GS1.
export function isValidGTIN(code: string) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false
  const digits = code.split('').map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

// Barcodes accepted by the app: standard GTINs (validated) or internal store codes of 4 to 14 digits
// whose length is not a GTIN length.
export function barcodeError(code: string): string | null {
  if (!/^\d{4,14}$/.test(code)) return 'O código deve ter de 4 a 14 números.'
  if ([8, 12, 13, 14].includes(code.length) && !isValidGTIN(code)) return 'Código inválido: confira os números (dígito verificador não confere).'
  return null
}

// CEP mask: 00000-000.
export function maskCEP(raw: string) {
  const d = onlyDigits(raw).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

// Password rules (same on app and server): 8+ characters, one uppercase letter, one number and one special character.
export const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'Pelo menos 8 caracteres', test: (p) => p.length >= 8 },
  { label: 'Uma letra maiúscula', test: (p) => /[A-ZÀ-Ý]/.test(p) },
  { label: 'Um número', test: (p) => /\d/.test(p) },
  { label: 'Um caractere especial (ex.: ! @ # $)', test: (p) => /[^A-Za-zÀ-ÿ0-9\s]/.test(p) },
]
export const isStrongPassword = (p: string) => PASSWORD_RULES.every((r) => r.test(p))
export const PASSWORD_ERROR = 'A senha precisa ter pelo menos 8 caracteres, uma letra maiúscula, um número e um caractere especial.'
