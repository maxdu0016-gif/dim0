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

import { getEffectiveApiBase } from "@/features/desktop/desktop-config"

// The frontend base: a runtime injection (docker-entrypoint's `__APP_CONFIG__` on
// web) wins; otherwise `getEffectiveApiBase` resolves the desktop override-else-
// baked-`VITE_API_URL` (and, on web, just `VITE_API_URL`). One precedence, owned
// by desktop-config. Falls back to the local dev backend.
const runtime =
  typeof window !== "undefined" ? window.__APP_CONFIG__?.apiBase : undefined

export const API_URL = runtime || getEffectiveApiBase() || "http://localhost:8888"
