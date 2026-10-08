import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://navalidade:navalidade@localhost:5432/navalidade_test',
    },
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
