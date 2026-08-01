/**
 * Desktop remote-server configuration.
 *
 * On the Tauri build there's no `__APP_CONFIG__` injection, so the remote server
 * URL (which powers sign-in → managed AI + synced boards) is a user setting in
 * localStorage. `config/api.ts::API_URL` reads it at module load; since that's a
 * one-time const, changing the server MUST reload the webview so every consumer
 * (REST, collab WS, managed `/ai/*`) re-resolves against the new base.
 *
 * Unset ⇒ the desktop app stays purely local/offline (BYOK) — no server contact.
 *
 * Note: the app addresses the backend with absolute paths (`new URL("/x", base)`),
 * so the server must be hosted at an origin root; a base path is preserved in the
 * stored value but not currently honored by the REST layer.
 */
import { clearTokens } from "@/features/signin/auth-storage"

/** localStorage key for the desktop remote-server URL. Also read by `config/api.ts`. */
export const DESKTOP_API_BASE_KEY = "dim0.desktop.apiBase"


/** The configured remote server base URL, or `undefined` when unset (local-only). */
export const getDesktopApiBase = (): string | undefined => {
  if (typeof localStorage === "undefined") return undefined
  return localStorage.getItem(DESKTOP_API_BASE_KEY) || undefined
}


/** Schemeless input defaults to `http` for localhost / IP literals (LAN self-host
 *  rarely has TLS) and `https` otherwise. */
const defaultScheme = (input: string): "http" | "https" => {
  const host = input.split("/")[0].split(":")[0].toLowerCase()
  const isLocal =
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  return isLocal ? "http" : "https"
}


/**
 * Normalize a user-entered server URL: trims, adds a scheme when missing (http for
 * local hosts, https otherwise), and drops a trailing slash while preserving any
 * base path. Throws on invalid input so the UI can show a message.
 */
export const normalizeApiBase = (raw: string): string => {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error("Enter a server URL")
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `${defaultScheme(trimmed)}://${trimmed}`
  const url = new URL(withScheme) // throws on malformed input
  return (url.origin + url.pathname).replace(/\/$/, "")
}


/** True when `base` uses plaintext http to a non-loopback host (creds/data exposed). */
export const isInsecureRemote = (base: string): boolean => {
  try {
    const u = new URL(base)
    if (u.protocol !== "http:") return false
    const h = u.hostname.toLowerCase()
    return !(h === "localhost" || h === "127.0.0.1" || h === "::1")
  } catch {
    return false
  }
}


const reloadApp = (): void => {
  if (typeof window !== "undefined") window.location.reload()
}


/**
 * Persist the server URL and reload so `API_URL` re-resolves. Auth tokens are
 * cleared first — they're minted by a specific server, so presenting them to a
 * different one would just 401. Throws on an invalid URL (no persist/reload).
 */
export const setDesktopApiBase = (raw: string): void => {
  const base = normalizeApiBase(raw)
  localStorage.setItem(DESKTOP_API_BASE_KEY, base)
  clearTokens()
  reloadApp()
}


/** Clear the server URL (back to local-only), drop auth tokens, and reload. */
export const clearDesktopApiBase = (): void => {
  if (typeof localStorage !== "undefined") localStorage.removeItem(DESKTOP_API_BASE_KEY)
  clearTokens()
  reloadApp()
}
