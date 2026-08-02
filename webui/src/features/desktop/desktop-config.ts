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
 * so the server must be hosted at an origin root. A URL with a path is rejected
 * (rather than silently mangled) — see `normalizeApiBase`.
 */
import { clearTokens } from "@/features/signin/auth-storage"

/** localStorage key for the desktop remote-server URL. Also read by `config/api.ts`. */
export const DESKTOP_API_BASE_KEY = "dim0.desktop.apiBase"


/** The user's server-URL override, or `undefined` when unset (localStorage only). */
export const getDesktopApiBase = (): string | undefined => {
  if (typeof localStorage === "undefined") return undefined
  return localStorage.getItem(DESKTOP_API_BASE_KEY) || undefined
}


/**
 * Whether a server is available at all — either baked in at build time via
 * `VITE_API_URL` (the same env var the web frontend uses, so a distributor can
 * ship pointing at their server) or set by the user (localStorage override). When
 * true the app offers sign-in directly; when false it asks the user to connect
 * one. The user override always wins over the baked default (see `config/api.ts`).
 */
export const hasDesktopServer = (): boolean =>
  getDesktopApiBase() !== undefined || Boolean(import.meta.env.VITE_API_URL)


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
 * Normalize a user-entered server URL to a bare origin: trims, adds a scheme when
 * missing (http for local hosts, https otherwise). Throws on invalid input, or on
 * a URL that carries a path — the app addresses the backend at an origin root, so
 * a path would be dropped by the REST layer (and Test, which keeps it, would
 * misleadingly pass). Better to reject it up front than route silently to 404s.
 */
export const normalizeApiBase = (raw: string): string => {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error("Enter a server URL")
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `${defaultScheme(trimmed)}://${trimmed}`
  const url = new URL(withScheme) // throws on malformed input
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("Use the server's root URL, without a path (e.g. https://dim0.example)")
  }
  return url.origin
}


/** True when `base` uses plaintext http to a non-loopback host (creds/data exposed). */
export const isInsecureRemote = (base: string): boolean => {
  try {
    const u = new URL(base)
    if (u.protocol !== "http:") return false
    // `hostname` brackets IPv6 literals (e.g. "[::1]"); strip them before matching.
    const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "")
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
