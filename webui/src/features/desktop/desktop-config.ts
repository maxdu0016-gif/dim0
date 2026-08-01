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
 */
import { DESKTOP_API_BASE_KEY } from "@/config/api"


/** The configured remote server base URL, or `undefined` when unset (local-only). */
export const getDesktopApiBase = (): string | undefined => {
  if (typeof localStorage === "undefined") return undefined
  return localStorage.getItem(DESKTOP_API_BASE_KEY) || undefined
}


/**
 * Normalize a user-entered server URL to a bare origin: trims, adds `https://`
 * when no scheme is given, and drops any path/trailing slash. Throws on invalid
 * input so the UI can show a message.
 */
export const normalizeApiBase = (raw: string): string => {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error("Enter a server URL")
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return new URL(withScheme).origin
}


const reloadApp = (): void => {
  if (typeof window !== "undefined") window.location.reload()
}


/** Persist the server URL and reload so `API_URL` re-resolves. Throws on invalid URL. */
export const setDesktopApiBase = (raw: string): void => {
  const base = normalizeApiBase(raw)
  localStorage.setItem(DESKTOP_API_BASE_KEY, base)
  reloadApp()
}


/** Clear the server URL (back to local-only) and reload. */
export const clearDesktopApiBase = (): void => {
  if (typeof localStorage !== "undefined") localStorage.removeItem(DESKTOP_API_BASE_KEY)
  reloadApp()
}
