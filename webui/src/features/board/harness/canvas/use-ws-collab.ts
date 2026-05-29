import { useEffect } from "react"
import {
  attachSync,
  type CanvasStore,
  type ClientId,
  type Edge,
  type Node,
  type Op,
  type OpBatch,
  type PresencePatch,
  type PresenceState,
  type SyncAdapter,
} from "@canvas-harness/core"
import { mintCollabTicket } from "@/features/board/api/collab-ticket"
import { API_URL } from "@/config/api"
import { notifyWsClose } from "@/features/connection/connection-state"
import { useAppStore } from "@/store"
import {
  adaptEdgeColors,
  adaptNodeColors,
  applyColorsToEdgeStyle,
  applyColorsToStyle,
  type StoredColors,
  type StoredEdgeColors,
} from "../theme/color-adapter"
import { getBoardThemeMode } from "../theme/theme-mode-ref"


/**
 * Phase 1a WebSocket adapter for cross-machine collab.
 *
 * Wire shape mirrors `@canvas-harness/sync-broadcast` — the backend is
 * a pure relay for v1a (no sequencing, no persistence), so we use the
 * same on-wire kinds:
 *
 *   send/receive:
 *     { kind: "batch",          batch }
 *     { kind: "presence",       clientId, state }
 *     { kind: "presence-leave", clientId }
 *     { kind: "hello",          clientId }
 *
 * Reconnect + `since_seq` catch-up land in Phase 1c; for now a dropped
 * socket means the user needs to refresh.
 */
export const useWsCollab = (
  store: CanvasStore,
  boardId: string | null,
  enabled: boolean,
): void => {
  const userEmail = useAppStore((s) => s.userEmail)
  const userId = useAppStore((s) => s.userId)
  const userName = userEmail.split("@")[0] || "Anonymous"

  useEffect(() => {
    if (!enabled || !boardId) return

    let cancelled = false
    let teardown: (() => void) | null = null

    const setup = async () => {
      let ticket: string
      try {
        const res = await mintCollabTicket(boardId)
        ticket = res.ticket
      } catch (err) {
        console.warn("collab: failed to mint ticket", err)
        return
      }
      if (cancelled) return

      const color = colorForId(userId ?? store.clientId)
      store.presence.setLocal({
        name: userName || "Anonymous",
        color,
        cursor: null,
        selection: [],
        editing: null,
      })

      const url = `${wsBaseFromApiUrl(API_URL)}/boards/${boardId}/collab?ticket=${encodeURIComponent(ticket)}`
      const adapter = createWebSocketSyncAdapter({
        url,
        clientId: store.clientId,
        initialPresence: store.presence.getLocal(),
        store,
      })
      const detachSync = attachSync(store, adapter)

      teardown = () => {
        detachSync()
        store.presence.setLocal({ cursor: null, selection: [], editing: null })
      }
    }

    setup()

    return () => {
      cancelled = true
      teardown?.()
      teardown = null
    }
  }, [store, boardId, enabled, userName, userId, userEmail])
}


/**
 * Build a `ws(s)://host` base from the configured HTTP API URL.
 * `http://` → `ws://`, `https://` → `wss://`.
 */
const wsBaseFromApiUrl = (apiUrl: string): string => apiUrl.replace(/^http/i, "ws")


/**
 * Cross-theme color fix: in-place rewrite `style.{bg,stroke,text}` on
 * every node/edge op so they match the LOCAL theme regardless of the
 * sender's theme. The canonical truth always lives in
 * `data._storedColors` (canonical Tailwind hex); the receiver projects
 * it through `adaptNodeColors / adaptEdgeColors` for paint.
 *
 * Mutates in place — the batch object is owned by us at this point
 * (decoded from JSON moments ago) and `attachSync` reads style after
 * we return.
 */
const normalizeBatchColorsForLocalTheme = (batch: OpBatch): void => {
  const mode = getBoardThemeMode()
  for (const op of batch.ops) {
    rewriteOpColors(op, mode)
  }
}


const rewriteOpColors = (op: Op, mode: "light" | "dark"): void => {
  // `op` is one of canvas-harness's tagged unions; we mutate `node` or
  // `patch` based on the variant. Reads/writes go through Partial<Node>
  // / Partial<Edge> casts to avoid type-narrowing acrobatics.
  if (op.type === "node.add") {
    rewriteNodeStyle(op.node, mode)
    return
  }
  if (op.type === "node.update") {
    rewriteNodeStyle(op.patch as Partial<Node>, mode)
    return
  }
  if (op.type === "edge.add") {
    rewriteEdgeStyle(op.edge, mode)
    return
  }
  if (op.type === "edge.update") {
    rewriteEdgeStyle(op.patch as Partial<Edge>, mode)
    return
  }
}


const rewriteNodeStyle = (target: Partial<Node>, mode: "light" | "dark"): void => {
  const data = target.data as { _storedColors?: StoredColors } | undefined
  const stored = data?._storedColors
  if (!stored) return
  const display = adaptNodeColors(stored, mode)
  target.style = applyColorsToStyle(target.style ?? {}, display)
}


const rewriteEdgeStyle = (target: Partial<Edge>, mode: "light" | "dark"): void => {
  const data = target.data as { _storedColors?: StoredEdgeColors } | undefined
  const stored = data?._storedColors
  if (!stored) return
  const display = adaptEdgeColors(stored, mode)
  target.style = applyColorsToEdgeStyle(target.style ?? {}, display)
}


/**
 * Collapse repeat update ops on the same target into one.
 *
 * canvas-harness emits a `store.updateEdge` / `store.updateNode` PER
 * pointermove for the edge-midpoint and node-resize gestures (see the
 * lib's use-interaction-gesture.ts). The receiver doesn't need each
 * intermediate value — the final patch is all that matters for
 * visual sync. We keep the EARLIEST `prev` (the gesture's starting
 * point so conflict detection still has a meaningful anchor) and
 * shallow-merge the patches in arrival order (last value wins per
 * field). Non-update ops pass through untouched and in order.
 */
const dedupeRepeatUpdates = (ops: Op[]): Op[] => {
  const out: Op[] = []
  const indexByKey = new Map<string, number>()
  for (const op of ops) {
    if (op.type === "node.update" || op.type === "edge.update") {
      const key = `${op.type}:${op.id as unknown as string}`
      const prevIdx = indexByKey.get(key)
      if (prevIdx !== undefined) {
        // Reuse the earlier slot — merge new patch on top, keep
        // earliest `prev`. The op union forces us through `any` here.
        const earlier = out[prevIdx] as { patch: Record<string, unknown> }
        const incoming = op as { patch: Record<string, unknown> }
        earlier.patch = { ...earlier.patch, ...incoming.patch }
        continue
      }
      indexByKey.set(key, out.length)
      out.push(op)
      continue
    }
    out.push(op)
  }
  return out
}


/**
 * Compute the on-curve midpoint world point from cubic-bezier control
 * points and attach it as `_midpoint` so the server can persist it
 * directly into `LinkProperties.edge_control_point`.
 *
 * Inverse of canvas-harness's `midpointToCubicControls`: with symmetric
 * c1 = c2 = c the curve at t=0.5 passes through `(S + T + 6·c) / 8`.
 * We do the math client-side so the server stays stateless (no need
 * to look up node positions just to recompute geometry).
 */
const enrichBatchWithMidpoint = (batch: OpBatch, store: CanvasStore): void => {
  for (const op of batch.ops) {
    if (op.type === "edge.add") {
      attachEdgeMidpoint(op.edge as Edge & { _midpoint?: { x: number; y: number } }, op.edge, store)
    } else if (op.type === "edge.update") {
      attachEdgeMidpoint(
        op.patch as Partial<Edge> & { _midpoint?: { x: number; y: number } },
        store.getEdge(op.id) ?? null,
        store,
        op.patch,
      )
    }
  }
}


const attachEdgeMidpoint = (
  target: Partial<Edge> & { _midpoint?: { x: number; y: number } },
  baseEdge: Edge | null,
  store: CanvasStore,
  patchOverride?: Partial<Edge>,
): void => {
  const control = (patchOverride?.control ?? target.control ?? baseEdge?.control) as
    | ReadonlyArray<{ x: number; y: number }>
    | undefined
  if (!control || control.length === 0) return
  // Source/target on the patch override take precedence (an endpoint
  // change in the same batch); else read from the existing edge.
  const sourceEnd = patchOverride?.source ?? baseEdge?.source
  const targetEnd = patchOverride?.target ?? baseEdge?.target
  if (!sourceEnd || !targetEnd) return
  const sourceWorld = endpointWorld(sourceEnd, store)
  const targetWorld = endpointWorld(targetEnd, store)
  if (!sourceWorld || !targetWorld) return
  const c = control[0]
  target._midpoint = {
    x: (sourceWorld.x + targetWorld.x + 6 * c.x) / 8,
    y: (sourceWorld.y + targetWorld.y + 6 * c.y) / 8,
  }
}


const endpointWorld = (
  end: Edge["source"] | Edge["target"],
  store: CanvasStore,
): { x: number; y: number } | null => {
  if ("nodeId" in end) {
    const node = store.getNode(end.nodeId)
    if (!node) return null
    return { x: node.x + end.localOffset.x, y: node.y + end.localOffset.y }
  }
  return end.worldPoint
}


/**
 * Deterministic-ish HSL color per client. Same user across tabs gets
 * the same color; different users get different ones.
 */
const colorForId = (id: string): string => {
  let h = 0
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) | 0
  }
  const hue = Math.abs(h) % 360
  return `hsl(${hue} 70% 55%)`
}


type OutboundMessage =
  | { kind: "op"; client_seq: number; batch: OpBatch }
  | { kind: "presence"; clientId: ClientId; state: PresenceState }
  | { kind: "presence-leave"; clientId: ClientId }
  | { kind: "hello"; clientId: ClientId }

type InboundMessage =
  | { kind: "welcome"; seq: number; snapshot: unknown }
  | { kind: "peer-op"; seq: number; batch: OpBatch }
  | { kind: "op-applied"; seq: number; client_seq: number }
  | { kind: "op-rejected"; client_seq: number; reason?: string }
  | { kind: "presence"; clientId: ClientId; state: PresenceState }
  | { kind: "presence-leave"; clientId: ClientId }
  | { kind: "hello"; clientId: ClientId }
  | { kind: "kick"; reason?: string }


type WebSocketSyncOptions = {
  url: string
  clientId: ClientId
  initialPresence?: PresenceState
  /**
   * Required for outbound enrichment — we look up node positions to
   * compute the edge midpoint from the cubic-bezier control points
   * (the server stores midpoint as a position; the math needs the
   * endpoint world coords).
   */
  store: CanvasStore
}


/**
 * Build a `SyncAdapter` over a single WebSocket. Mirrors the
 * BroadcastChannel adapter's contract — outbound frames are JSON of
 * `WireMessage`; inbound frames are dispatched to batch / presence
 * listeners. Self-echo is impossible because the server already
 * excludes the sender.
 */
const createWebSocketSyncAdapter = ({
  url,
  clientId,
  initialPresence,
  store,
}: WebSocketSyncOptions): SyncAdapter => {
  const ws = new WebSocket(url)
  const batchListeners = new Set<(batch: OpBatch) => void>()
  const presenceListeners = new Set<(clientId: ClientId, state: PresenceState | null) => void>()
  let lastLocalPresence = initialPresence
  let openSent = false
  const outbox: OutboundMessage[] = []

  // Local monotonic counter so the client can match `op-applied` acks
  // back to outgoing ops. Server stamps the global `seq` separately.
  let clientSeq = 0
  // Highest server `seq` we've observed — used as `since_seq` on
  // reconnect (Phase 1c) and to detect out-of-order delivery.
  let lastServerSeq = 0

  // Outbound coalesce window — buffer local op batches for a brief
  // window and merge their ops into a single wire message. Caps
  // typing-burst load on the server (1 OpenAI embed call per merged
  // batch instead of one per keystroke) while staying well below
  // perceptual "live" latency for peers.
  const COALESCE_MS = 75
  const pendingOps: { client_seq: number; batch: OpBatch }[] = []
  let coalesceTimer: ReturnType<typeof setTimeout> | null = null

  const send = (msg: OutboundMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    } else {
      outbox.push(msg)
    }
  }

  const flushPendingOps = () => {
    coalesceTimer = null
    if (pendingOps.length === 0) return
    const first = pendingOps[0]
    const last = pendingOps[pendingOps.length - 1]
    // Concatenate ops in arrival order; server applies them sequentially
    // so causal intent is preserved. Use the latest batch's id/ts/origin
    // so the merged batch identifies as the most recent action.
    const concatenated = pendingOps.flatMap((p) => p.batch.ops)
    const mergedBatch: OpBatch = {
      ...first.batch,
      id: last.batch.id,
      ts: last.batch.ts,
      origin: last.batch.origin,
      // Collapse consecutive update ops on the same target so a 5-second
      // edge-midpoint drag or node-resize doesn't ship 60+ wire ops for
      // the same id. Each gesture's last patch carries the cumulative
      // final state; the earliest `prev` is preserved for conflict
      // detection.
      ops: dedupeRepeatUpdates(concatenated),
    }
    // Take the most-recent client_seq — the server's op-applied for
    // that one implicitly acks the older ones (a single seq covers the
    // merged write).
    send({ kind: "op", client_seq: last.client_seq, batch: mergedBatch })
    pendingOps.length = 0
  }

  const queueOp = (client_seq: number, batch: OpBatch) => {
    // Compute the edge midpoint once per batch from the local store
    // (source/target endpoints + control[c1, c2]); the server stores
    // the midpoint as a position. See `enrichBatchWithMidpoint`.
    enrichBatchWithMidpoint(batch, store)
    pendingOps.push({ client_seq, batch })
    if (coalesceTimer === null) {
      coalesceTimer = setTimeout(flushPendingOps, COALESCE_MS)
    }
  }

  ws.addEventListener("open", () => {
    if (!openSent) {
      openSent = true
      send({ kind: "hello", clientId })
      if (lastLocalPresence) {
        send({ kind: "presence", clientId, state: lastLocalPresence })
      }
    }
    while (outbox.length > 0) {
      const msg = outbox.shift()
      if (msg) ws.send(JSON.stringify(msg))
    }
  })

  ws.addEventListener("message", (e: MessageEvent) => {
    let msg: InboundMessage
    try {
      msg = JSON.parse(typeof e.data === "string" ? e.data : "") as InboundMessage
    } catch {
      return
    }
    if (msg.kind === "welcome") {
      // Phase 1b: the initial board state is still loaded via REST so
      // we ignore `snapshot` here — it duplicates state the store has.
      // We track `seq` for Phase 1c's reconnect catch-up.
      lastServerSeq = msg.seq
      return
    }
    if (msg.kind === "peer-op") {
      if (msg.seq > lastServerSeq) lastServerSeq = msg.seq
      // Self-echo is impossible (server excludes sender), but guard.
      if (msg.batch.clientId === clientId) return
      // Re-derive `style.{bg,stroke,text}` from the canonical
      // `_storedColors` field for the local theme. Without this, a
      // dark-mode peer's adapted hex would land in a light-mode
      // store and paint as a dark color on a white canvas (and vice
      // versa). See [color-adapter.ts] for the projection rules.
      normalizeBatchColorsForLocalTheme(msg.batch)
      for (const cb of batchListeners) cb(msg.batch)
      return
    }
    if (msg.kind === "op-applied") {
      if (msg.seq > lastServerSeq) lastServerSeq = msg.seq
      return
    }
    if (msg.kind === "op-rejected") {
      // The server bounced our op (most commonly: a viewer trying to
      // mutate). The user-facing surface is the read-only banner +
      // any toast wired at a higher level; we just log here. The
      // local store keeps the optimistic mutation — refresh wins.
      console.warn(
        `collab: op rejected client_seq=${msg.client_seq} reason=${msg.reason ?? "(none)"}`,
      )
      return
    }
    if (msg.kind === "presence") {
      if (msg.clientId === clientId) return
      for (const cb of presenceListeners) cb(msg.clientId, msg.state)
      return
    }
    if (msg.kind === "presence-leave") {
      if (msg.clientId === clientId) return
      for (const cb of presenceListeners) cb(msg.clientId, null)
      return
    }
    if (msg.kind === "hello" && msg.clientId !== clientId && lastLocalPresence) {
      send({ kind: "presence", clientId, state: lastLocalPresence })
      return
    }
    if (msg.kind === "kick") {
      console.warn(`collab: kicked by server reason=${msg.reason ?? "(none)"}`)
      try {
        ws.close(1000, "kicked")
      } catch {
        // ignore
      }
    }
  })

  ws.addEventListener("close", (e) => {
    if (e.code !== 1000 && e.code !== 1001) {
      console.warn(`collab: ws closed code=${e.code} reason=${e.reason || "(none)"}`)
    }
    notifyWsClose(e.code)
  })

  const onPageHide = () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ kind: "presence-leave", clientId }))
    }
  }
  window.addEventListener("pagehide", onPageHide)

  return {
    capabilities: { causalOrdering: true },
    sendBatch(batch: OpBatch) {
      clientSeq += 1
      queueOp(clientSeq, batch)
    },
    sendPresence(patch: PresencePatch) {
      const state: PresenceState = {
        ...(lastLocalPresence ?? ({} as PresenceState)),
        ...patch,
        clientId,
      }
      lastLocalPresence = state
      send({ kind: "presence", clientId, state })
    },
    onBatch(cb) {
      batchListeners.add(cb)
      return () => {
        batchListeners.delete(cb)
      }
    },
    onPresence(cb) {
      presenceListeners.add(cb)
      return () => {
        presenceListeners.delete(cb)
      }
    },
    destroy() {
      window.removeEventListener("pagehide", onPageHide)
      // Flush any buffered ops synchronously so a teardown right after
      // an edit (e.g. closing the tab) doesn't drop the user's last
      // action. Cancel the deferred timer first.
      if (coalesceTimer !== null) {
        clearTimeout(coalesceTimer)
        coalesceTimer = null
      }
      flushPendingOps()
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ kind: "presence-leave", clientId }))
      }
      try {
        ws.close(1000, "client detached")
      } catch {
        // ignore
      }
      batchListeners.clear()
      presenceListeners.clear()
    },
  }
}
