// Where the mini-app iframe runtime is loaded from, and how the host talks to
// it. Kept in a non-component module so both MiniAppMount and the prefetch
// helper share one resolution (and so the component file stays component-only
// for react-refresh).

// Runtime origin resolution priority:
//   1. window.__APP_CONFIG__.miniAppOrigin  — set by docker-entrypoint.sh
//      from VITE_MINI_APP_ORIGIN at container start. Lets one image
//      ship to dev / staging / prod without rebuilding.
//   2. import.meta.env.VITE_MINI_APP_ORIGIN — build-time fallback for
//      vite-dev (no entrypoint runs there).
//   3. "" — empty string makes the broken state obvious in devtools.
// See mini-app-archi.md §6.1.
export const RUNTIME_ORIGIN =
  (typeof window !== "undefined" ? window.__APP_CONFIG__?.miniAppOrigin : undefined) ||
  import.meta.env.VITE_MINI_APP_ORIGIN ||
  ""


// Single-frontend (default): no separate runtime origin configured, so load the
// self-contained runtime as a same-origin static asset into an OPAQUE-origin
// iframe (sandbox WITHOUT allow-same-origin) — isolation without a second origin
// (best practice for untrusted code; see mini-app-archi.md). Cross-origin mode
// (with Vite HMR) is opt-in by setting VITE_MINI_APP_ORIGIN.
export const SINGLE_FRONTEND = RUNTIME_ORIGIN === ""
export const RUNTIME_PATH = SINGLE_FRONTEND ? "/mini-app/index.html" : `${RUNTIME_ORIGIN}/index.html`
// postMessage target: an opaque iframe has no addressable origin → "*". The
// inbound guard (source === contentWindow) is the real boundary either way.
export const POST_TARGET = SINGLE_FRONTEND ? "*" : RUNTIME_ORIGIN
// Inbound origin to trust: an opaque-sandbox iframe posts with origin "null".
export const EXPECTED_ORIGIN = SINGLE_FRONTEND ? "null" : RUNTIME_ORIGIN
export const SANDBOX = SINGLE_FRONTEND ? "allow-scripts" : "allow-scripts allow-same-origin"


let runtimePrefetched = false

/**
 * Warm the browser + service-worker cache for the mini-app runtime once per
 * session, on idle. The runtime is a single ~5 MB document shared by every
 * mini-app (theme flows via postMessage; the SW keys it ignoring the query, so
 * one warmed entry serves every theme). Called when a board's first mini-app
 * node view mounts, so the first actual open isn't a cold 5 MB fetch. Uses a
 * low-priority `<link rel="prefetch">` so it never competes with visible work.
 */
export function prefetchMiniAppRuntime(): void {
  if (runtimePrefetched || typeof document === "undefined") return
  runtimePrefetched = true
  const warm = (): void => {
    const link = document.createElement("link")
    link.rel = "prefetch"
    link.href = RUNTIME_PATH
    document.head.appendChild(link)
  }
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(warm)
  } else {
    setTimeout(warm, 1000)
  }
}
