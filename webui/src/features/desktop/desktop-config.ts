/**
 * Desktop remote-server configuration.
 *
 * On the Tauri build there's no `__APP_CONFIG__` injection, so the remote server
 * URL (which powers sign-in → managed AI + synced boards) is baked in at build
 * via `VITE_API_URL` — there is no in-app override. `config/api.ts::API_URL`
 * reads it at module load.
 *
 * Unset ⇒ the desktop app stays purely local/offline (BYOK) — no server contact.
 */


/**
 * The effective remote-server base: the origin baked in at build via
 * `VITE_API_URL` (from the `API_ORIGIN` release variable), or `undefined` when
 * unset (a pure local/offline build). Consumed by `config/api.ts` to set
 * `API_URL`.
 *
 * Normalized to a bare origin — the app addresses the backend with absolute
 * paths (`new URL("/x", base)`), so any path in the value is dropped rather than
 * silently 404-ing every call. Tolerates a missing scheme (a bare `host:port`
 * defaults to `https` instead of parsing as `new URL("host:port")` → origin
 * `"null"`) and is non-throwing, so a misconfigured value degrades instead of
 * crashing at module load. The deployer is responsible for using https.
 */
export const getEffectiveApiBase = (): string | undefined => {
  const raw = import.meta.env.VITE_API_URL?.trim()
  if (!raw) return undefined
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    return new URL(withScheme).origin
  } catch {
    return raw
  }
}
