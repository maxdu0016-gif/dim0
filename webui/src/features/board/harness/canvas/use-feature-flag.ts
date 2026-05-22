import { useSyncExternalStore } from "react"


const STORAGE_KEY = "topix:feature.canvas-harness"


/** Whether canvas-harness mode is enabled. localStorage-driven so dev can toggle without a server restart. */
export const isCanvasHarnessEnabled = (): boolean => {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}


const subscribe = (cb: () => void): (() => void) => {
  const handler = (e: StorageEvent): void => {
    if (e.key === STORAGE_KEY) cb()
  }
  window.addEventListener("storage", handler)
  return () => window.removeEventListener("storage", handler)
}


/**
 * Hook returning the current canvas-harness feature-flag value.
 * Toggle from devtools: `localStorage.setItem("topix:feature.canvas-harness", "1")`
 * then reload.
 */
export const useCanvasHarnessEnabled = (): boolean =>
  useSyncExternalStore(subscribe, isCanvasHarnessEnabled, () => false)
