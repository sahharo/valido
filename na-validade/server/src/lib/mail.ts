import { env } from '../env.ts'

export interface Mail { to: string; toName?: string; subject: string; html: string; text: string }

// Messages "sent" while running the test suite, so tests can read the links.
export const sentMails: Mail[] = []

export const mailConfigured = () => Boolean(env.brevoApiKey && env.mailFrom)

export async function sendMail(mail: Mail) {
  if (env.isTest) {
    sentMails.push(mail)
    return
  }
  if (!mailConfigured()) {
    if (env.isLocal) console.info(`[mail] ${mail.to}: ${mail.subject}\n${mail.text}`)
    else console.warn('[mail] BREVO_API_KEY/MAIL_FROM não configurados: e-mail não enviado.')
    return
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Validei', email: env.mailFrom },
      to: [{ email: mail.to, name: mail.toName }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) console.error(`[mail] Brevo respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`)
}
