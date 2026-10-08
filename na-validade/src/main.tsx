import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { ConfirmHost } from './components/ConfirmHost.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ToastHost } from './components/ToastHost.tsx'
import { queryClient } from './queries.ts'
import { initTheme } from './theme.ts'

initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <ConfirmHost />
      <ToastHost />
    </QueryClientProvider>
  </StrictMode>,
)
