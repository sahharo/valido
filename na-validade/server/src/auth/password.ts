import { hash, verify } from '@node-rs/argon2'

// Argon2id with OWASP's recommended minimum parameters (19 MiB, 2 iterations).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 }

export const hashPassword = (password: string) => hash(password, OPTIONS)

let dummyHash: Promise<string> | undefined

// When the user does not exist we still verify against a dummy hash, so response time does not reveal it.
export async function verifyPassword(passwordHash: string | undefined, password: string) {
  dummyHash ??= hashPassword('dummy-password-for-timing')
  const target = passwordHash ?? (await dummyHash)
  const ok = await verify(target, password).catch(() => false)
  return ok && passwordHash !== undefined
}
