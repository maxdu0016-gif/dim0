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


const HOST_ORIGIN = import.meta.env.VITE_HOST_ORIGIN

if (!HOST_ORIGIN) {
  throw new Error("VITE_HOST_ORIGIN not set at build time")
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
