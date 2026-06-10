// Mini-app iframe runtime entry — Phase 0 scaffolding.
//
// At this point the runtime does NOT compile or render anything. It
// signals "ready" to the host once mounted and logs any message it
// receives whose origin matches VITE_HOST_ORIGIN. Phase 1 wires sucrase
// compile + the actual React render; Phase 2 adds the RPC bridge.
//
// See mini-app-archi.md §9 for the target shape this file is growing
// into across phases.

const HOST_ORIGIN = import.meta.env.VITE_HOST_ORIGIN

if (!HOST_ORIGIN) {
  // Fail loud at startup: a missing origin means every postMessage
  // origin check would silently reject everything, which presents as
  // "iframe loads but nothing happens" — the worst kind of bug to debug.
  throw new Error("VITE_HOST_ORIGIN not set at build time")
}


// Root marker so we know the runtime mounted at all. Phase 1 replaces
// this with a real React root.
const root = document.getElementById("root")
if (root) {
  root.textContent = "mini-app runtime ready (phase 0)"
  root.style.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace"
  root.style.padding = "12px"
  root.style.color = "#666"
}


window.addEventListener("message", (event) => {
  if (event.origin !== HOST_ORIGIN) return
  // Phase 0: just log. Phase 1 dispatches on event.data.type.
  console.log("[mini-app-runtime] message from host:", event.data)
})


window.parent.postMessage({ type: "mini-app:ready" }, HOST_ORIGIN)
