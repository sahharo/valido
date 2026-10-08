import { JOB_TITLES } from '../shared/domain.ts'
import { isValidEmail, isValidPhone, maskPhone } from '../shared/validation.ts'

type JobTitle = (typeof JOB_TITLES)[number]

// Editable person data (own profile or a team member), shared by Ajustes and the team list.
export type PersonDraft = { firstName: string; lastName: string; email: string; phone: string; jobTitle: JobTitle }
export const toPersonDraft = (u: { firstName: string; lastName: string; email: string; phone: string; jobTitle: string }): PersonDraft => ({
  firstName: u.firstName, lastName: u.lastName, email: u.email, phone: maskPhone(u.phone), jobTitle: u.jobTitle as JobTitle,
})
export const personValid = (f: PersonDraft) =>
  f.firstName.trim().length >= 2 && f.lastName.trim().length >= 2 && isValidEmail(f.email) && isValidPhone(f.phone)
