import { useEffect } from "react"
import type { CanvasStore } from "@canvas-harness/core"
import { useBoardAppStore } from "../store/board-app-store"


/**
 * Tells whether a keyboard event originated from a focused text-entry
 * surface. We don't steal undo/redo or tool shortcuts from those — the
 * user is typing.
 */
const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return true
  if (target.isContentEditable) return true
  return false
}


/**
 * Global keyboard bindings for the canvas-harness board:
 *
 *  - Cmd/Ctrl+Z         → store.undo()
 *  - Cmd/Ctrl+Shift+Z   → store.redo()
 *  - Cmd/Ctrl+Y         → store.redo()  (Windows convention)
 *  - V                  → tool 'select'
 *  - H                  → tool 'pan'
 *  - F                  → tool 'frame'
 *
 * Skipped when focus is in an input / textarea / contentEditable so
 * inline editing keeps the native shortcuts. canvas-harness already
 * wires Cmd+C/X/V/[]/]} internally — see Canvas.tsx.
 */
export const useBoardKeyboard = (store: CanvasStore): void => {
  const setTool = useBoardAppStore((s) => s.setTool)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target)) return
      const meta = e.metaKey || e.ctrlKey

      if (meta && (e.key === "z" || e.key === "Z")) {
        e.preventDefault()
        if (e.shiftKey) store.redo()
        else store.undo()
        return
      }
      if (meta && (e.key === "y" || e.key === "Y")) {
        e.preventDefault()
        store.redo()
        return
      }

      if (meta || e.altKey) return

      if (e.key === "v" || e.key === "V") setTool("select")
      else if (e.key === "h" || e.key === "H") setTool("pan")
      else if (e.key === "f" || e.key === "F") setTool("frame")
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [store, setTool])
}
