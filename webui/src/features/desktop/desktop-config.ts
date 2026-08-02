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
import { isTauri } from "@/platform"

/** localStorage key for the desktop remote-server URL. Also read by `config/api.ts`. */
export const DESKTOP_API_BASE_KEY = "dim0.desktop.apiBase"


/**
 * The user's server-URL override, or `undefined` when unset. Desktop-only: a stray
 * value under this key on a web origin must never repoint `API_URL` (REST / collab
 * / AI), so the read is gated on `isTauri()`.
 */
export const getDesktopApiBase = (): string | undefined => {
  if (!isTauri() || typeof localStorage === "undefined") return undefined
  return localStorage.getItem(DESKTOP_API_BASE_KEY) || undefined
}


/**
 * The server URL baked in at build via `VITE_API_URL` (the same env var the web
 * frontend uses), or `undefined`. A distributor sets it (from the `API_ORIGIN`
 * release variable) so users just sign in. Normalized to a bare origin — the app
 * addresses the backend with absolute paths, so a stray path would 404 every call.
 * Non-throwing (unlike the user-input path) so a misconfig degrades rather than
 * crashing at module load; the deployer is responsible for using https.
 */
export const getBakedApiBase = (): string | undefined => {
  const raw = import.meta.env.VITE_API_URL
  if (!raw) return undefined
  try {
    return new URL(raw).origin
  } catch {
    return raw
  }
}


/**
 * The effective server base: the user's localStorage override wins over the baked
 * default. The single source for that precedence — consumed by `config/api.ts`
 * (which sets `API_URL`) and the server dialog, so the order lives in one place.
 */
export const getEffectiveApiBase = (): string | undefined =>
  getDesktopApiBase() ?? getBakedApiBase()


/**
 * Whether a server is available at all — baked in at build (`VITE_API_URL`) or set
 * by the user. When true the app offers sign-in directly; a build with neither
 * prompts to connect one. (Local/offline use doesn't depend on this: the front
 * door makes zero backend calls while signed out, regardless of a configured server.)
 */
export const hasDesktopServer = (): boolean => getEffectiveApiBase() !== undefined


/** Schemeless input defaults to `http` for localhost / IP literals (LAN self-host
 *  rarely has TLS) and `https` otherwise. */
const defaultScheme = (input: string): "http" | "https" => {
  const authority = input.split("/")[0].toLowerCase()
  // A bracketed IPv6 literal (`[::1]:8888`) must be unwrapped before stripping the
  // port, or `split(":")` mangles it.
  const host = authority.startsWith("[")
    ? authority.slice(1, authority.indexOf("]"))
    : authority.split(":")[0]
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
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
