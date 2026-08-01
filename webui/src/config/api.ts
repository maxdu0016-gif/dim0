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

import { isTauri } from "@/platform"

/**
 * localStorage key holding the remote server URL on desktop. There is no
 * docker-entrypoint injecting `__APP_CONFIG__` in the Tauri build, so the
 * signed-in managed + synced path reads its base from this user setting
 * (written by desktop Settings). Synchronous, so it's available at this
 * module's load; unset ⇒ falls through, and offline BYOK never needs it.
 */
export const DESKTOP_API_BASE_KEY = "dim0.desktop.apiBase"

const desktopApiBase =
  isTauri() && typeof localStorage !== "undefined"
    ? localStorage.getItem(DESKTOP_API_BASE_KEY) || undefined
    : undefined

const runtime =
  typeof window !== "undefined" ? window.__APP_CONFIG__?.apiBase : undefined

export const API_URL =
  runtime || desktopApiBase || import.meta.env.VITE_API_URL || "http://localhost:8888"
