export const env = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://navalidade:navalidade@localhost:5432/navalidade',
  port: Number(process.env.PORT ?? 3333),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  // Bluesoft Cosmos (Brazilian GTIN database, Portuguese descriptions). Optional: skipped when empty.
  cosmosToken: process.env.COSMOS_TOKEN ?? '',
  offUserAgent: process.env.OFF_USER_AGENT ?? 'NaValidade/1.0 (contato@navalidade.app)',
  timezone: process.env.APP_TIMEZONE ?? 'America/Sao_Paulo',
  isTest: process.env.NODE_ENV === 'test',
}
