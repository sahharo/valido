export const env = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://navalidade:navalidade@localhost:5432/navalidade',
  port: Number(process.env.PORT ?? 3333),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  // Bluesoft Cosmos (Brazilian GTIN database, Portuguese descriptions). Optional: skipped when empty.
  cosmosToken: process.env.COSMOS_TOKEN ?? '',
  offUserAgent: process.env.OFF_USER_AGENT ?? 'NaValidade/1.0 (contato@navalidade.app)',
  timezone: process.env.APP_TIMEZONE ?? 'America/Sao_Paulo',
  isTest: process.env.NODE_ENV === 'test',
  // E-mail delivery (Brevo HTTP API). Without a key, reset links are only printed in local development.
  brevoApiKey: process.env.BREVO_API_KEY ?? '',
  mailFrom: process.env.MAIL_FROM ?? '',
  // Public address used in e-mail links; Render provides RENDER_EXTERNAL_URL automatically.
  appUrl: (process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
  isLocal: !process.env.RENDER && process.env.NODE_ENV !== 'production',
}
