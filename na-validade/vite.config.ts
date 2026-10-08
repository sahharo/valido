import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const api = { '/api': { target: process.env.API_URL ?? 'http://localhost:3333' } }

// Host enabled so the app can be opened from other devices; /api is proxied to the backend (same origin for cookies).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: true, allowedHosts: true, proxy: api },
  preview: { host: true, allowedHosts: true, proxy: api },
})
