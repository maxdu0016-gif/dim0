import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './query-client'
import { router } from './routes'
import { RouterProvider } from '@tanstack/react-router'
import { registerSW } from 'virtual:pwa-register'
import { isTauri } from './platform'

/**
 * Registers the PWA service worker and keeps it up to date automatically.
 * Skipped on the Tauri desktop build — the app is served from the native shell,
 * not a web origin, so the offline SW is both unnecessary and unsupported there.
 */
if (!isTauri()) {
  registerSW({ immediate: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
