# ADR-DESKTOP-002: Desktop networking — BYOK direct via plugin-http; managed + synced via an optional server URL

**Status:** Accepted · 2026-08-01
**Applies to:** `webui/src/features/agent/engine/services/desktop-*.ts`, `webui/src/features/agent/engine/byok-client.ts`, `webui/src/features/desktop/**`, `webui/src/config/api.ts`, `webui/src-tauri/capabilities/default.json`

## Decision
On the Tauri build, the two request paths split by mode (`resolveService` is
unchanged — only the transport branches on `isTauri()`):

- **BYOK → direct.** LLM / search / parse in `byok` mode MUST reach the provider
  **directly** via `@tauri-apps/plugin-http` (CORS-free), NOT our `/ai/*` proxy: the
  OpenAI SDK gets the Tauri `fetch` (`byok-client.ts`), and search/parse use
  `desktop-search.ts` / `desktop-parse.ts` returning the `/ai/*` reply shapes. Every
  provider host MUST be listed in the `http` capability allow-list.
- **Managed → remote.** `managed` calls stay on the remote server, driven by
  `API_URL`. The server MAY be **baked in at build** via `VITE_API_URL` (the same
  env var the web frontend uses — so a distributor ships pointing at their server
  and users just sign in), and a **user override** MAY be set in localStorage
  (`getDesktopApiBase`), which wins. Sign-in is offered whenever either exists
  (`hasDesktopServer`); a build with neither prompts to connect one. Setting/clearing
  the override MUST reload the webview (the module-load `API_URL` re-resolves
  everywhere) and MUST clear auth tokens; the URL MUST be an **origin root** (no path).
- **Unset server ⇒ pure local/offline** (BYOK only), zero server contact.

## Why
The desktop webview enforces CORS like a browser, so BYOK provider calls need a
non-CORS path — `plugin-http` provides it — and going through our proxy would
require our server (defeating offline) and can't relay the user's LLM key anyway.
A shipped desktop app can't hold *our* secret keys, so **managed** is served only
by the remote server, gated on sign-in. One `API_URL` already drives REST, collab
WS (`wsBaseFromApiUrl`), and managed `/ai/*`, so a single setting lights up the
whole remote path — no per-subsystem wiring. Reload is required because `API_URL`
is a module-load const; tokens are cleared because they're minted per-server; the
root-URL rule exists because the app addresses the backend with absolute paths.

## Consequences
- Offline BYOK agent works with the user's keys: LLM, all four search engines
  (linkup/tavily/perplexity/exa), and PDF parse (Mistral OCR, base64 single-POST —
  same call the backend `MistralParser` makes). Unported engines fall back online.
- `fetch` + `code_interpreter` are managed-only by existing design → auto-`off`
  offline (no BYOK key slot / no local sandbox).
- Adding a BYOK provider = a thin client + its host in the capability allow-list.
- Per-capability resolution + metering are unchanged — see [ADR-AGENT-003](./ADR-AGENT-003-service-resolution-and-metering.md).

## Rejected alternatives
- **Bundle the Python backend as a sidecar** — 100s of MB, per-OS, and there are no
  managed keys to reuse in a shipped app; only avoids rewriting ~4 thin HTTP calls.
- **A local Rust HTTP server for `/ai/*`** — more Rust than injecting a fetch; kept
  as a fallback only if plugin-http streaming disappoints.
- **Accept a server URL with a base path** — the REST layer uses absolute paths and
  would drop it (while Test, which keeps it, misleadingly passes); rejected up front.

## Verify
`grep -rn "tauriFetch\|plugin-http" webui/src/features/agent/engine/services/desktop-http.ts` — BYOK routes through the CORS-free fetch.
`grep -n "getDesktopApiBase\|clearTokens\|reload" webui/src/features/desktop/desktop-config.ts` — server URL drives API_URL; set/clear reload + drop tokens.
