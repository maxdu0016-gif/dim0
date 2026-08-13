// On-canvas view for a mini-app note.
//
// Wraps the host-side MiniAppMount (which owns the sandboxed iframe,
// state hydration, and RPC routing) with the standard canvas chrome:
// traffic lights for delete/expand, a label caption below the card.
// Iframe lifecycle: the iframe boots only when the node is in view AND the board
// camera is at rest (useBoardCameraAtRest) — panning/scrolling at any speed mounts
// nothing new, so nodes crossed mid-scroll aren't booted — or immediately if it's
// kept alive from a recent visit (bounded LRU, useKeepAlive). Once mounted it stays
// while in view OR retained, so a visible node is never torn down; nodes not yet
// mounted / beyond the LRU show a placeholder.
//
// Mirrors the shape of WidgetView in node-types/widget/view.tsx — the
// canvas chrome conventions live there.

import { useCallback, useEffect, useRef, useState } from "react"

import { CursorClickIcon } from "@phosphor-icons/react"
import { type NodeId } from "@canvas-harness/core"
import { useCanvasStore, useNode, useSelection } from "@canvas-harness/react"
import { removeNodeSubtree } from "@/features/board/harness/graph/subtree"

import { MiniAppMount, prefetchMiniAppRuntime } from "@/features/mini-app"
import { cn } from "@/lib/utils"

import type { NoteNodeData } from "../../convert/note-to-node"
import {
  NodeTitleCaption,
  NodeTrafficLights,
  useIsInView,
} from "../../shared-views"
import { useBoardCameraAtRest } from "../../canvas/board-camera-motion"
import { useBoardAppStore } from "../../store/board-app-store"
import { useMiniAppKeepAlive } from "./use-keep-alive"


// Card chrome (padding + traffic-lights row + title slot). Subtracted
// from the canvas node's reported `h` to derive the inner iframe slot
// height, and added back when computing the node's target height from
// the widget's natural content height.
const CARD_CHROME_PX = 48

// Hard cap on automatic growth — past this, the widget gets a
// scrollbar inside the iframe slot instead of pushing the canvas
// node taller. Stops a runaway widget from monopolizing the board.
const MAX_AUTO_GROW_PX = 1200


export interface MiniAppViewProps {
  id: NodeId
}


/**
 * Canvas view for a mini-app note. Renders the iframe via MiniAppMount while the
 * node should stay mounted (in view, or a recently-seen off-screen node kept
 * alive by useMiniAppKeepAlive); otherwise shows a paused-state placeholder card
 * so the rest of the board stays responsive.
 */
export function MiniAppView({ id }: MiniAppViewProps) {
  const node = useNode(id)
  const store = useCanvasStore()
  const openNodeSurface = useBoardAppStore((s) => s.openNodeSurface)
  const canEdit = useBoardAppStore((s) => s.canEdit)
  const wrapRef = useRef<HTMLDivElement>(null)
  // initialInView: false — don't mount every node on first load before the
  // observer reports which are actually visible (and don't seed the keep-alive
  // LRU with never-seen nodes).
  const isInView = useIsInView(wrapRef, "200px", false)
  // Only boot the iframe once the node has settled in view (see MOUNT_SETTLE_MS):
  // flying past a node during a fast pan never mounts it. Panning BACK to a
  // recently-visited zone is still instant — keep-alive retains it, so it mounts
  // via isLive without waiting to re-settle.
  // Only boot iframes when the camera is at rest: while the user pans/scrolls at
  // any speed, nodes crossing the viewport are NOT mounted (that churn — compositor
  // layers + bundle boot + teardown — is the measured scroll jank). A dwell timer
  // wasn't enough: a moderate scroll keeps a node in view long enough to "settle".
  const cameraAtRest = useBoardCameraAtRest()
  const mountReady = isInView && cameraAtRest
  // Retained-set membership: kept alive from a recent visit (bounded LRU) so
  // panning back re-uses the live iframe instead of re-parsing the ~5 MB runtime.
  const isLive = useMiniAppKeepAlive(id as unknown as string, mountReady)
  // Boot the iframe once the node is in view AND the camera has stopped, OR when
  // it's kept alive from a recent visit (instant). Once mounted, KEEP it while the
  // node is in view OR retained — so a genuinely visible node is never torn down
  // (even if the LRU evicts it); it unmounts only once off-screen AND evicted.
  const [shouldMount, setShouldMount] = useState(false)
  useEffect(() => {
    if (mountReady || isLive) setShouldMount(true)
    else if (!isInView && !isLive) setShouldMount(false)
  }, [mountReady, isLive, isInView])
  // Gate iframe interaction on selection so canvas pan/zoom gestures
  // pass cleanly through unselected mini-apps. Without this, the
  // iframe's `pointer-events-auto` captures the pointer the moment
  // the user's drag crosses into the card → canvas-harness loses
  // gesture tracking → pan dies mid-swipe. Same pattern sheet uses for
  // its inline editor (gated on `editing` instead of selection).
  const selection = useSelection()
  const isSelected = selection.includes(id)

  // A mini-app node exists on this board → warm the runtime cache on idle (once
  // per session) so the first open isn't a cold ~5 MB fetch, even for nodes that
  // are still below the fold.
  useEffect(() => {
    prefetchMiniAppRuntime()
  }, [])

  // rAF-throttled grow-only resize. The widget posts `mini-app:resize`
  // through MiniAppMount on every content-size change; we batch those
  // into at most one node-resize per animation frame and only ever
  // grow the card (the user is free to shrink it manually via the
  // canvas resize handles afterward). `lastAppliedH` deduplicates
  // identical heights so an idle widget reporting the same number
  // doesn't trigger redundant store writes.
  const pendingHeightRef = useRef<number | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const lastAppliedHRef = useRef<number>(0)
  const latestWidgetHRef = useRef<number | null>(null)
  // A kept-alive node can stay mounted off-screen, so gate the store write on
  // visibility — otherwise an off-screen widget's resize would grow the node
  // (and broadcast a collab op) with nothing visible to justify it. The latest
  // reported height is stashed and flushed when the node returns to view.
  const inViewRef = useRef(isInView)
  useEffect(() => {
    inViewRef.current = isInView
  }, [isInView])

  const applyHeight = useCallback(
    (widgetH: number) => {
      const target = Math.min(widgetH + CARD_CHROME_PX, MAX_AUTO_GROW_PX)
      const current = store.getNode(id)?.h ?? 0
      // Grow only, and only by a meaningful delta (avoid storms from
      // sub-pixel oscillation).
      if (target <= current + 1) return
      if (target === lastAppliedHRef.current) return
      lastAppliedHRef.current = target
      store.updateNode(id, { h: target })
    },
    [id, store],
  )

  const onContentHeightChange = useCallback(
    (widgetH: number) => {
      latestWidgetHRef.current = widgetH
      if (!inViewRef.current) return
      pendingHeightRef.current = widgetH
      if (rafIdRef.current != null) return
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        const pending = pendingHeightRef.current
        pendingHeightRef.current = null
        if (pending == null) return
        applyHeight(pending)
      })
    },
    [applyHeight],
  )

  // Flush the height reported while off-screen when the node returns to view.
  useEffect(() => {
    if (isInView && latestWidgetHRef.current != null) applyHeight(latestWidgetHRef.current)
  }, [isInView, applyHeight])

  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current)
    }
  }, [])

  if (!node) return null

  const data = (node.data ?? {}) as Partial<NoteNodeData>
  const label = data.label?.markdown
  const source = node.content ?? ""

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none relative h-full w-full select-none"
    >
      <div
        className={cn(
          "absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-dashed border-border bg-background px-2 pb-2 pt-10",
        )}
        // Kept-alive but off-screen: skip rendering this whole card subtree
        // (chrome + iframe) so the browser stops its render/paint work and can
        // throttle the iframe's rAF, while the iframe stays mounted (no re-parse).
        // Restores instantly on return. `inset-0` is explicit sizing, so
        // `contain: size` doesn't collapse the box. No-op on webviews without
        // content-visibility (older WebKit).
        style={{ contentVisibility: shouldMount && !isInView ? "hidden" : undefined }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-xl border border-border/50 bg-background">
          {source && shouldMount ? (
            <MiniAppMount
              noteId={id as unknown as string}
              source={source}
              className={cn(
                "h-full w-full bg-transparent",
                isSelected ? "pointer-events-auto" : "pointer-events-none",
              )}
              onContentHeightChange={onContentHeightChange}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
              <CursorClickIcon className="size-5 shrink-0" />
              <span>{source ? "Mini-app paused" : "Mini-app source will render here"}</span>
            </div>
          )}
        </div>
      </div>

      <NodeTrafficLights
        onDelete={canEdit ? () => removeNodeSubtree(store, id) : undefined}
        onExpand={canEdit ? () => openNodeSurface(id as unknown as string, "mini-app") : undefined}
      />

      <div className="pointer-events-auto absolute left-1/2 top-full z-20 mt-2 w-full -translate-x-1/2">
        <NodeTitleCaption
          nodeId={id}
          label={label}
          placeholder="Untitled mini-app"
          textClassName="text-center text-sm font-handwriting text-foreground"
        />
      </div>
    </div>
  )
}
