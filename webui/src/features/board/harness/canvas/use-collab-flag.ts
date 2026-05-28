import { useSyncExternalStore } from "react"


/**
 * Phase 0/1 collab toggle — checked client-side from localStorage so we
 * can flip transport without rebuilding. Set
 *
 *   localStorage.setItem("dim0:collab", "broadcast")  // same-browser multi-tab
 *   localStorage.setItem("dim0:collab", "ws")         // cross-machine via server
 *
 * in the devtools console to enable, then refresh.
 * Set to anything else (or clear) to disable.
 *
 * Replaced by a user-/board-level setting once collab graduates from
 * preview.
 */
const STORAGE_KEY = "dim0:collab"


export type CollabMode = "off" | "broadcast" | "ws"


const read = (): CollabMode => {
  if (typeof window === "undefined") return "off"
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === "broadcast" || v === "ws") return v
    return "off"
  } catch {
    return "off"
  }
}


const subscribe = (notify: () => void): (() => void) => {
  if (typeof window === "undefined") return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) notify()
  }
  window.addEventListener("storage", onStorage)
  return () => window.removeEventListener("storage", onStorage)
}


export const useCollabMode = (): CollabMode =>
  useSyncExternalStore(subscribe, read, () => "off")


/**
 * Back-compat boolean helper for callers that only care whether some
 * form of collab is active.
 */
export const useCollabEnabled = (): boolean => useCollabMode() !== "off"
