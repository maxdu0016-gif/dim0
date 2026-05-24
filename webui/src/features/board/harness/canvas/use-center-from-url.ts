import { useEffect, type RefObject } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import type { CanvasStore, NodeId } from "@canvas-harness/core"


/**
 * Read `?center=<nodeId>` from the URL. Once the store is `ready`
 * (hydration finished), look up the target node, snap the camera to
 * center it in the viewport, then strip `center` from the URL so a
 * later refresh doesn't re-snap the camera if the user has panned
 * away in the meantime.
 *
 * Mounted AFTER viewport persistence so a shareable `?center=` link
 * wins over the cached pan from a prior session.
 */
export const useCenterFromUrl = (
  store: CanvasStore,
  wrapRef: RefObject<HTMLElement | null>,
  ready: boolean,
): void => {
  const navigate = useNavigate()
  const search = useSearch({
    strict: false,
    select: (s: { center?: string }) => s?.center,
  })

  useEffect(() => {
    if (!ready || !search) return
    const wrap = wrapRef.current
    if (!wrap) return
    const node = store.getNode(search as NodeId)
    if (!node) {
      // Stale link — drop the param silently and bail.
      navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => {
          const next = { ...prev } as Record<string, unknown>
          delete next.center
          return next
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      return
    }
    const rect = wrap.getBoundingClientRect()
    const cam = store.getCamera()
    const centerWorld = { x: node.x + node.w / 2, y: node.y + node.h / 2 }
    // `camera.{x,y}` is the world-space coord at the top-left of the
    // viewport; placing the node center at viewport center means the
    // top-left should be (nodeCenter - viewportHalf / zoom).
    const nextCam = {
      x: centerWorld.x - rect.width / (2 * cam.z),
      y: centerWorld.y - rect.height / (2 * cam.z),
      z: cam.z,
    }
    store.setCamera(nextCam)
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => {
        const next = { ...prev } as Record<string, unknown>
        delete next.center
        return next
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  }, [ready, search, store, wrapRef, navigate])
}
