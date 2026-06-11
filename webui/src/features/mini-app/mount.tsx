// MiniAppMount — the host-side React component that owns the sandboxed
// iframe lifecycle, the postMessage handshake, and the routing of
// host.* RPC calls back into the host app.
//
// Lifecycle (see mini-app-archi.md §9 for the full spec):
//
//   1. Mount → kick off fetchMiniAppState(noteId) in parallel with the
//      iframe loading the runtime bundle.
//   2. iframe posts {type:"mini-app:ready"} once mounted.
//   3. When BOTH "ready" arrived AND the saved-state fetch settled
//      (success OR failure — failure falls back to undefined), the host
//      posts {type:"mini-app:render", source, savedState, theme}.
//   4. Whenever the host's active theme/palette changes thereafter, the
//      host posts {type:"mini-app:theme", theme}. The iframe applies
//      data attributes only; no widget remount.
//   5. iframe may post {type:"mini-app:rpc"} → host dispatches by method,
//      replies with {type:"mini-app:rpc-result"}. See dispatch.ts.
//   6. iframe may post {type:"mini-app:resize"} → host updates height.
//
// Security: the iframe is sandbox="allow-scripts" only, and the runtime
// is served from a different origin (different port in dev, different
// subdomain in prod — see mini-app-archi.md §5). Every incoming message
// is filtered on event.origin === RUNTIME_ORIGIN AND
// event.source === iframeRef.current.contentWindow. Both, no exceptions.

import { useEffect, useRef, useState } from "react"

import { toast } from "sonner"

import { useTheme } from "@/components/theme-provider"

import { createMessageHandler } from "./dispatch"
import { fetchMiniAppState, saveMiniAppState } from "./state-client"


// Runtime origin resolution priority:
//   1. window.__APP_CONFIG__.miniAppOrigin  — set by docker-entrypoint.sh
//      from VITE_MINI_APP_ORIGIN at container start. Lets one image
//      ship to dev / staging / prod without rebuilding.
//   2. import.meta.env.VITE_MINI_APP_ORIGIN — build-time fallback for
//      vite-dev (no entrypoint runs there).
//   3. "" — empty string makes the broken state obvious in devtools.
// See mini-app-archi.md §6.1.
const RUNTIME_ORIGIN =
  (typeof window !== "undefined" ? window.__APP_CONFIG__?.miniAppOrigin : undefined) ||
  import.meta.env.VITE_MINI_APP_ORIGIN ||
  ""


// Dev-only host-side debug surface — pairs with the iframe's
// __MINI_APP_DEBUG__. Lets us inspect from the board's devtools
// whether the handshake is happening + what origin we expect.
declare global {
  var __MINI_APP_HOST_DEBUG__:
    | {
        runtimeOrigin: string
        mounts: number
        readyEventsReceived: number
        rpcEventsReceived: number
        lastReadyFrom?: string
      }
    | undefined
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  globalThis.__MINI_APP_HOST_DEBUG__ ??= {
    runtimeOrigin: RUNTIME_ORIGIN,
    mounts: 0,
    readyEventsReceived: 0,
    rpcEventsReceived: 0,
  }
}


export interface MiniAppMountProps {
  /** The note id whose state we hydrate on mount and save on each change. */
  noteId: string
  /** JSX source the agent wrote; lives on note.content. */
  source: string
  /** Optional canvas-side className for sizing/spacing. */
  className?: string
}


export function MiniAppMount({
  noteId,
  source,
  className,
}: MiniAppMountProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeReady, setIframeReady] = useState(false)
  const [savedStateLoaded, setSavedStateLoaded] = useState(false)
  const savedStateRef = useRef<unknown>(undefined)
  // Pull the host's active theme so the iframe can mirror it. `themeId`
  // is the palette ("parchment", "tokyo-night", …) and `resolvedTheme`
  // collapses "system" mode down to a concrete "light" | "dark". Both
  // map 1:1 to data attributes the iframe sets on its own <html>.
  const { themeId, resolvedTheme } = useTheme()
  // contentHeight is the widget's reported natural height (from
  // mini-app:resize). When >0, we use it directly; until then the
  // iframe fills its parent so the user sees the widget at the
  // canvas card's full size. Once auto-resize kicks in (Phase 4
  // grows the canvas node too), this becomes the source of truth.
  const [contentHeight, setContentHeight] = useState<number | null>(null)

  // Hydrate saved state from the backend. Failures fall through
  // silently — a network blip on load shouldn't block the widget from
  // rendering; it just starts from undefined state.
  useEffect(() => {
    let active = true
    fetchMiniAppState(noteId)
      .then((state) => {
        if (!active) return
        savedStateRef.current = state
        setSavedStateLoaded(true)
      })
      .catch(() => {
        if (!active) return
        setSavedStateLoaded(true)
      })
    return () => {
      active = false
    }
  }, [noteId])

  // Register the message listener. Recreated whenever noteId changes
  // so the closure captures the right one for saveState routing.
  useEffect(() => {
    if (globalThis.__MINI_APP_HOST_DEBUG__) {
      globalThis.__MINI_APP_HOST_DEBUG__.mounts += 1
    }
    const handler = createMessageHandler({
      postToIframe: (msg) => {
        iframeRef.current?.contentWindow?.postMessage(msg, RUNTIME_ORIGIN)
      },
      getIframeWindow: () => iframeRef.current?.contentWindow ?? null,
      expectedOrigin: RUNTIME_ORIGIN,
      noteId,
      saveState: saveMiniAppState,
      toastInfo: (m) => toast(m),
      toastError: (m) => toast.error(m),
      onReady: () => {
        if (globalThis.__MINI_APP_HOST_DEBUG__) {
          globalThis.__MINI_APP_HOST_DEBUG__.readyEventsReceived += 1
          globalThis.__MINI_APP_HOST_DEBUG__.lastReadyFrom = RUNTIME_ORIGIN
        }
        setIframeReady(true)
      },
      onResize: (h) => setContentHeight(h),
    })
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [noteId])

  // Once both signals are in (handshake + state fetched), kick off the
  // render. The theme payload is captured here too so the very first
  // paint already matches the host palette / mode. Theme is intentionally
  // NOT in this effect's dep list — flipping themes shouldn't trash the
  // widget's React tree; see the dedicated mini-app:theme effect below.
  useEffect(() => {
    if (!iframeReady || !savedStateLoaded) return
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "mini-app:render",
        source,
        savedState: savedStateRef.current,
        theme: { id: themeId, mode: resolvedTheme },
      },
      RUNTIME_ORIGIN,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeReady, savedStateLoaded, source])

  // Live theme propagation. Re-posts `mini-app:theme` whenever the host
  // theme changes so the iframe flips `data-theme`/`data-mode` on its
  // own <html> without remounting the widget. Gated on iframeReady so we
  // don't race the handshake; on first mount the render effect above
  // already carries the same payload, so the iframe receives one render
  // + one theme back-to-back — harmless, second is a no-op.
  useEffect(() => {
    if (!iframeReady) return
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "mini-app:theme",
        theme: { id: themeId, mode: resolvedTheme },
      },
      RUNTIME_ORIGIN,
    )
  }, [iframeReady, themeId, resolvedTheme])

  return (
    <iframe
      ref={iframeRef}
      data-testid="mini-app-iframe"
      // `allow-same-origin` is included on purpose. Without it the iframe
      // has an opaque "null" origin, which breaks (a) Vite's HMR module
      // loading in dev — null-origin iframes can't load their own
      // modules due to SOP — and (b) any client-side state the runtime
      // needs (its own localStorage, etc.).
      //
      // Security is still preserved because the iframe is loaded from
      // VITE_MINI_APP_ORIGIN, which is a different origin from the host
      // (different port in dev, different subdomain in prod). The host
      // → iframe boundary still blocks cross-origin DOM/cookie/storage
      // access. The iframe still cannot remove its own sandbox.
      sandbox="allow-scripts allow-same-origin"
      src={`${RUNTIME_ORIGIN}/index.html`}
      title="mini-app"
      style={{
        width: "100%",
        // contentHeight wins when the runtime has reported its size;
        // otherwise fill the parent so the widget is visible at the
        // canvas card's natural size.
        height: contentHeight ?? "100%",
        border: 0,
        display: "block",
      }}
      className={className}
    />
  )
}
