declare global {
  interface Window {
    __APP_CONFIG__?: {
      apiBase?: string
      billingEnabled?: string
      /** Mini-app iframe runtime origin (set per-env by docker-entrypoint.sh). */
      miniAppOrigin?: string
      /** Host app origin — read by the iframe runtime, never the host. */
      hostOrigin?: string
    }
  }
}

import { getDesktopApiBase } from "@/features/desktop/desktop-config"

// On the Tauri build there's no docker-entrypoint injecting `__APP_CONFIG__`, so
// the remote server base is a user setting read from localStorage (canonical
// reader in desktop-config). Synchronous, so it's available at module load; unset
// ⇒ falls through, and offline BYOK never needs it.
const desktopApiBase = getDesktopApiBase()

const runtime =
  typeof window !== "undefined" ? window.__APP_CONFIG__?.apiBase : undefined

export const API_URL =
  runtime || desktopApiBase || import.meta.env.VITE_API_URL || "http://localhost:8888"
