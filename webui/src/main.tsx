import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { preloadCanvasFonts } from './fonts'
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
} else {
  // Desktop shell uses an overlay title bar (traffic lights float over content).
  // This class lets the layout reserve the top-left corner for the traffic lights.
  document.documentElement.classList.add("tauri")
}

// Kick off canvas font loading before first paint so the board doesn't render
// with the `cursive` fallback (WebKit won't load a canvas-only font on its own).
preloadCanvasFonts()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
