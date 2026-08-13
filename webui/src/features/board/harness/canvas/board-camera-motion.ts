import { useEffect } from "react"
import type { CanvasStore } from "@canvas-harness/core"
import { create } from "zustand"


// The camera counts as "at rest" this long after its last change. Mirrors the
// lib's ~150ms motion-end deadline that useViewportPersistence also builds on.
const QUIET_MS = 150


const useMotionStore = create<{ atRest: boolean }>(() => ({ atRest: true }))


/**
 * Install ONCE per board (in HarnessCanvas): tracks whether the board camera has
 * been at rest for QUIET_MS. Subscribes to the lib's `'camera'` event and
 * debounces — the same approach useViewportPersistence uses, because the
 * interaction-state machine (panning→marqueeing→idle) is unreliable across input
 * paths (mouse pan ends via marquee, not idle). Catches pan + zoom + programmatic
 * setCamera uniformly.
 */
export function useTrackBoardCameraMotion(store: CanvasStore): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onCamera = (): void => {
      if (useMotionStore.getState().atRest) useMotionStore.setState({ atRest: false })
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => useMotionStore.setState({ atRest: true }), QUIET_MS)
    }
    const unsub = store.subscribe("camera", onCamera)
    return () => {
      if (timer) clearTimeout(timer)
      unsub()
      useMotionStore.setState({ atRest: true })
    }
  }, [store])
}


/** True when the board camera has been at rest for QUIET_MS (no pan/zoom). */
export function useBoardCameraAtRest(): boolean {
  return useMotionStore((s) => s.atRest)
}
