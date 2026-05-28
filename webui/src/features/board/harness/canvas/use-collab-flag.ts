import { useSyncExternalStore } from "react"


/**
 * Phase 0 collab toggle — checked client-side from localStorage so we
 * can flip it without rebuilding. Set
 *
 *   localStorage.setItem("dim0:collab", "broadcast")
 *
 * in the devtools console to enable same-browser multi-tab collab,
 * then refresh both tabs. Set to anything else (or clear) to disable.
 *
 * Replaced in Phase 1+ by a user-/board-level setting once the WS
 * transport lands.
 */
const STORAGE_KEY = "dim0:collab"


const read = (): boolean => {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "broadcast"
  } catch {
    return false
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


export const useCollabEnabled = (): boolean =>
  useSyncExternalStore(subscribe, read, () => false)
