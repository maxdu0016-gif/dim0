// Mini-app iframe runtime entry — Phase 1 (compile + render path).
//
// Listens for `mini-app:render` messages from the host, compiles the
// agent's JSX source via sucrase, and mounts the resulting component
// inside a React error boundary. Compile failures and render failures
// show as inline error cards rather than tearing down the iframe.
//
// Phase 2 layers postMessage RPC on top of this; Phase 4 adds theme
// propagation + auto-resize.

import { StrictMode } from "react"
import type { ReactNode } from "react"
import { createRoot } from "react-dom/client"

import { compileMiniApp } from "./compile"
import { ErrorBoundary } from "./error-boundary"
import { CompileErrorCard, RuntimeErrorCard } from "./error-display"
import { handleHostMessage, setHostInitialState } from "./rpc"
import { MINI_APP_SCOPE_NAMES, MINI_APP_SCOPE_VALUES } from "./scope"
import "./runtime.css"
// Tailwind v4's browser build JIT-compiles utility classes at runtime
// by scanning the live DOM. Critical for mini-apps: the agent's JSX is
// a string at compile time, so the static @tailwindcss/vite plugin
// can't see classes like `fill-amber-200` or `bg-sky-50` and they
// never make it into the compiled CSS. The browser build picks them
// up the moment React mounts the elements. Side-effect-only import.
import "@tailwindcss/browser"


const HOST_ORIGIN = import.meta.env.VITE_HOST_ORIGIN

if (!HOST_ORIGIN) {
  throw new Error("VITE_HOST_ORIGIN not set at build time")
}


// Dev-only debug surface for the iframe console. The console treats
// inputs as classic scripts, so `import.meta` is unavailable from a
// prompt — exposing a plain window global keeps the runtime
// inspectable. Read in devtools as `__MINI_APP_DEBUG__`.
declare global {
  var __MINI_APP_DEBUG__:
    | {
        hostOrigin: string
        runtimeOrigin: string
        bootedAt: string
        readyPosted: boolean
        renderCount: number
        lastIncoming?: { type?: unknown; origin?: string }
      }
    | undefined
}

if (import.meta.env.DEV) {
  globalThis.__MINI_APP_DEBUG__ = {
    hostOrigin: HOST_ORIGIN,
    runtimeOrigin: window.location.origin,
    bootedAt: new Date().toISOString(),
    readyPosted: false,
    renderCount: 0,
  }
}


const rootEl = document.getElementById("root")
if (!rootEl) throw new Error("missing #root element")
const root = createRoot(rootEl)


/**
 * Build the scope map from the registry's parallel name/value arrays.
 * The runtime passes the *values* positionally to `new Function` via
 * compileMiniApp; we rebuild a name→value object here so call sites
 * (and the agent's code, through the function's argument list) see a
 * stable shape.
 */
function buildScope(): Record<string, unknown> {
  return Object.fromEntries(
    MINI_APP_SCOPE_NAMES.map((name, i) => [name, MINI_APP_SCOPE_VALUES[i]]),
  )
}


function renderWidget(source: string, savedState: unknown) {
  if (globalThis.__MINI_APP_DEBUG__) {
    globalThis.__MINI_APP_DEBUG__.renderCount += 1
  }
  // The agent's component reads `host.initialState` (typically inside a
  // useState initializer) on first render. Set it before compile so the
  // first read sees the persisted value, not undefined.
  setHostInitialState(savedState)

  const result = compileMiniApp(source, buildScope())
  if (!result.ok) {
    root.render(<CompileErrorCard error={result.error} />)
    return
  }
  const Widget = result.Component as () => ReactNode
  root.render(
    <StrictMode>
      <ErrorBoundary fallback={(err) => <RuntimeErrorCard error={err} />}>
        <Widget />
      </ErrorBoundary>
    </StrictMode>,
  )
}


window.addEventListener("message", (event) => {
  if (globalThis.__MINI_APP_DEBUG__) {
    const data = event.data as { type?: unknown } | null
    globalThis.__MINI_APP_DEBUG__.lastIncoming = {
      type: data?.type,
      origin: event.origin,
    }
  }
  if (event.origin !== HOST_ORIGIN) return
  // Route RPC results back to their pending promises first — handle returns
  // true if it recognized + processed the message type, in which case we're
  // done with this event.
  if (handleHostMessage(event.data)) return

  const msg = event.data as { type?: string; source?: string; savedState?: unknown } | null
  if (!msg || typeof msg !== "object") return
  if (msg.type === "mini-app:render" && typeof msg.source === "string") {
    renderWidget(msg.source, msg.savedState)
  }
})


window.parent.postMessage({ type: "mini-app:ready" }, HOST_ORIGIN)
if (globalThis.__MINI_APP_DEBUG__) {
  globalThis.__MINI_APP_DEBUG__.readyPosted = true
}


// Auto-resize: watch the widget's body height and report it to the
// host so the iframe (and eventually the canvas node, Phase 4) can
// grow to fit. ResizeObserver fires on every content-size change,
// including after React commits a state update that grows the DOM.
// We measure body.scrollHeight rather than the observed contentRect
// because the latter reports the body's *visible* box, which stays
// constrained when the iframe parent is shorter than the content.
let lastReportedHeight = 0
function reportHeight() {
  const height = document.body.scrollHeight
  if (height === lastReportedHeight || height <= 0) return
  lastReportedHeight = height
  window.parent.postMessage(
    { type: "mini-app:resize", height },
    HOST_ORIGIN,
  )
}

const resizeObserver = new ResizeObserver(() => reportHeight())
resizeObserver.observe(document.body)

// Also fire on every animation frame for the first second — covers
// the post-mount React renders that update DOM after the iframe
// becomes visible but before ResizeObserver settles.
let framesLeft = 60
function frameTick() {
  reportHeight()
  if (framesLeft-- > 0) requestAnimationFrame(frameTick)
}
requestAnimationFrame(frameTick)
