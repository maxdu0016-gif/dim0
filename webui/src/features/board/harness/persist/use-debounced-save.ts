import { useEffect, useRef, useState } from "react"
import type { CanvasStore } from "@canvas-harness/core"
import { diffSnapshots, EMPTY_SNAPSHOT, type Snapshot } from "./diff-snapshots"
import { flushApiCalls } from "./flush-api-calls"


export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error"


export type UseBoardDebouncedSaveOptions = {
  /** Idle delay between the last commit and the next flush. Default 500ms. */
  debounceMs?: number
}


/**
 * Subscribe to canvas-store commits and persist them via the existing
 * board REST API. Captures a snapshot per flush, diffs against the
 * last-saved snapshot, and issues only the minimal set of REST calls.
 *
 * Undo / redo participate automatically — the lib re-emits `'change'`
 * with `origin: 'history'`, the timer re-arms, the next flush sees
 * the post-undo scene and writes the inverse calls.
 *
 * Pass `boardId = null` (e.g. during route transitions) to suspend
 * saving without unmounting the host.
 */
export const useBoardDebouncedSave = (
  store: CanvasStore,
  boardId: string | null,
  options: UseBoardDebouncedSaveOptions = {},
): SaveStatus => {
  const debounceMs = options.debounceMs ?? 500
  const [status, setStatus] = useState<SaveStatus>("idle")
  const lastSavedRef = useRef<Snapshot>(EMPTY_SNAPSHOT)

  // Re-baseline whenever scope changes — assume the freshly-hydrated
  // scene is in sync with the server.
  useEffect(() => {
    lastSavedRef.current = {
      nodes: store.getAllNodes(),
      edges: store.getAllEdges(),
    }
    setStatus("idle")
  }, [store, boardId])

  useEffect(() => {
    if (!boardId) return
    let timer: ReturnType<typeof setTimeout> | null = null

    const flush = async (): Promise<void> => {
      timer = null
      const next: Snapshot = {
        nodes: store.getAllNodes(),
        edges: store.getAllEdges(),
      }
      const calls = diffSnapshots(lastSavedRef.current, next)
      if (calls.length === 0) {
        setStatus("idle")
        return
      }
      setStatus("saving")
      try {
        await flushApiCalls(calls, boardId)
        lastSavedRef.current = next
        setStatus("saved")
      } catch (err) {
        console.error("[harness/persist] flush failed", err)
        setStatus("error")
      }
    }

    return store.subscribe("change", () => {
      if (timer === null) setStatus("pending")
      else clearTimeout(timer)
      timer = setTimeout(() => { void flush() }, debounceMs)
    })
  }, [store, boardId, debounceMs])

  return status
}
