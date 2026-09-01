import { useEffect, type RefObject } from "react"
import type { CanvasStore } from "@canvas-harness/core"
import { isIOSNative } from "@/platform"
import { applyNativePencilStroke } from "./apply-native-pencil-stroke"
import { configureNativePencil, subscribeNativePencilStrokes } from "./native-pencil-bridge"


export type NativePencilCanvasOptions = {
  store: CanvasStore
  wrapRef: RefObject<HTMLElement | null>
  boardId: string | null
  parentId: string | null
  ready: boolean
  canEdit: boolean
  enabled: boolean
  color: string
  displayColor: string
  size: number
}


/** Binds the native PencilKit overlay to the active canvas and its formal node store. */
export const useNativePencilCanvas = ({
  store,
  wrapRef,
  boardId,
  parentId,
  ready,
  canEdit,
  enabled,
  color,
  displayColor,
  size,
}: NativePencilCanvasOptions): void => {
  const contextId = boardId ? `${boardId}:${parentId ?? ""}` : "unscoped"

  useEffect(() => {
    if (!isIOSNative()) return

    return subscribeNativePencilStrokes((message) => {
      if (!ready || !canEdit || !boardId || message.contextId !== contextId) return false
      return applyNativePencilStroke(store, message, boardId, parentId).handled
    })
  }, [store, boardId, parentId, contextId, ready, canEdit])

  useEffect(() => {
    if (!isIOSNative()) return

    const element = wrapRef.current
    let animationFrame = 0
    const sendConfiguration = (): void => {
      if (!element) return
      const rect = element.getBoundingClientRect()
      configureNativePencil({
        enabled: enabled && ready && canEdit,
        contextId,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        color: displayColor,
        storedColor: color,
        width: size * store.getCamera().z,
      })
    }
    const scheduleConfiguration = (): void => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(sendConfiguration)
    }

    const resizeObserver = new ResizeObserver(scheduleConfiguration)
    if (element) resizeObserver.observe(element)
    const unsubscribeCamera = store.subscribe("camera", scheduleConfiguration)
    window.addEventListener("resize", scheduleConfiguration)
    window.addEventListener("scroll", scheduleConfiguration, true)
    scheduleConfiguration()

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      unsubscribeCamera()
      window.removeEventListener("resize", scheduleConfiguration)
      window.removeEventListener("scroll", scheduleConfiguration, true)

      const rect = element?.getBoundingClientRect()
      configureNativePencil({
        enabled: false,
        contextId,
        rect: rect
          ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          : { x: 0, y: 0, width: 0, height: 0 },
        color: displayColor,
        storedColor: color,
        width: size * store.getCamera().z,
      })
    }
  }, [store, wrapRef, contextId, ready, canEdit, enabled, color, displayColor, size])
}
