import { useEffect, useRef } from "react"
import type { CanvasStore, InteractionState } from "@canvas-harness/core"
import { loadViewport, saveViewport, viewportScopeKey } from "./viewport-storage"


/**
 * Per-board camera persistence with zero per-frame cost.
 *
 * Strategy: subscribe to the lib's `'interaction'` event (fires on
 * mode transitions, not per frame) and write to localStorage when the
 * user finishes a pan or zoom gesture (`panning | zooming → idle`).
 * Between gestures the camera doesn't move, so nothing else needs to
 * trigger a save.
 *
 * Restore: read the saved camera once after the caller signals
 * `ready` (i.e., after the scene has hydrated) and call
 * `store.setCamera` with the stored value. Skipped silently if no
 * entry exists for this scope.
 *
 * Pass `boardId = null` (e.g., between routes) to suspend both restore
 * and save without unmounting.
 */
export const useViewportPersistence = (
  store: CanvasStore,
  boardId: string | null,
  rootId: string | null,
  ready: boolean,
): void => {
  const restoredKeyRef = useRef<string | null>(null)

  // Restore once per scope, after hydration completes.
  useEffect(() => {
    if (!boardId || !ready) return
    const key = viewportScopeKey(boardId, rootId)
    if (restoredKeyRef.current === key) {
      console.log("[viewport] restore skip: already restored key=", key)
      return
    }
    const saved = loadViewport(key)
    console.log("[viewport] restore attempt key=", key, "saved=", saved)
    if (saved) {
      store.setCamera(saved)
      console.log("[viewport] restore: setCamera(", saved, ")")
    }
    restoredKeyRef.current = key
  }, [store, boardId, rootId, ready])

  // Save on every gesture-end. `'interaction'` event fires on mode
  // changes only — a typical pan is two fires (idle→panning + panning
  // →idle), nowhere near per-frame.
  useEffect(() => {
    if (!boardId) return
    const key = viewportScopeKey(boardId, rootId)
    let prevMode: InteractionState["mode"] = store.getInteractionState().mode
    console.log("[viewport] save subscribe: key=", key, "initial prevMode=", prevMode)

    return store.subscribe("interaction", (state) => {
      const nextMode = state.mode
      const wasMoving = prevMode === "panning" || prevMode === "zooming"
      const isIdle = nextMode === "idle"
      if (prevMode !== nextMode) {
        // Only log actual mode transitions — pointer updates fire same-mode events constantly.
        console.log("[viewport] mode", prevMode, "→", nextMode, "wasMoving=", wasMoving, "isIdle=", isIdle)
      }
      prevMode = nextMode
      if (wasMoving && isIdle) {
        const cam = store.getCamera()
        console.log("[viewport] SAVE key=", key, "camera=", cam)
        saveViewport(key, cam)
      }
    })
  }, [store, boardId, rootId])
}
