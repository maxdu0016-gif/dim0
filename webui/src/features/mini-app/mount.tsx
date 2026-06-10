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
//   4. iframe may post {type:"mini-app:rpc"} → host dispatches by method,
//      replies with {type:"mini-app:rpc-result"}. See dispatch.ts.
//   5. iframe may post {type:"mini-app:resize"} → host updates height.
//
// Security: the iframe is sandbox="allow-scripts" only, and the runtime
// is served from a different origin (different port in dev, different
// subdomain in prod — see mini-app-archi.md §5). Every incoming message
// is filtered on event.origin === RUNTIME_ORIGIN AND
// event.source === iframeRef.current.contentWindow. Both, no exceptions.

import { useEffect, useRef, useState } from "react"

import { toast } from "sonner"

import { createMessageHandler } from "./dispatch"
import { fetchMiniAppState, saveMiniAppState } from "./state-client"


// Resolved at build time per env (see mini-app-archi.md §6.1). Empty
// string when unset — leaves the iframe src obviously broken in devtools
// rather than silently failing. Production builds throw at the runtime
// entry too, so a missing env never gets far.
const RUNTIME_ORIGIN = import.meta.env.VITE_MINI_APP_ORIGIN ?? ""


export interface MiniAppMountProps {
  /** The note id whose state we hydrate on mount and save on each change. */
  noteId: string
  /** JSX source the agent wrote; lives on note.content. */
  source: string
  /** Optional canvas-side className for sizing/spacing. */
  className?: string
  /** Fallback height before the iframe reports its own. */
  initialHeight?: number
}


export function MiniAppMount({
  noteId,
  source,
  className,
  initialHeight = 240,
}: MiniAppMountProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeReady, setIframeReady] = useState(false)
  const [savedStateLoaded, setSavedStateLoaded] = useState(false)
  const savedStateRef = useRef<unknown>(undefined)
  const [height, setHeight] = useState(initialHeight)

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
      onReady: () => setIframeReady(true),
      onResize: (h) => setHeight(h),
    })
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [noteId])

  // Once both signals are in (handshake + state fetched), kick off the
  // render. Theme is hardcoded "light" for v1 — proper theme sync lands
  // in Phase 4 (mini-app-archi.md §13).
  useEffect(() => {
    if (!iframeReady || !savedStateLoaded) return
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "mini-app:render",
        source,
        savedState: savedStateRef.current,
        theme: "light",
      },
      RUNTIME_ORIGIN,
    )
  }, [iframeReady, savedStateLoaded, source])

  return (
    <iframe
      ref={iframeRef}
      data-testid="mini-app-iframe"
      sandbox="allow-scripts"
      src={`${RUNTIME_ORIGIN}/index.html`}
      title="mini-app"
      style={{ width: "100%", height, border: 0, display: "block" }}
      className={className}
    />
  )
}
