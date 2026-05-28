import { useEffect } from "react"
import {
  attachSync,
  type CanvasStore,
  type ClientId,
  type OpBatch,
  type PresencePatch,
  type PresenceState,
  type SyncAdapter,
} from "@canvas-harness/core"
import { mintCollabTicket } from "@/features/board/api/collab-ticket"
import { API_URL } from "@/config/api"
import { useAppStore } from "@/store"


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


type WireMessage =
  | { kind: "batch"; batch: OpBatch }
  | { kind: "presence"; clientId: ClientId; state: PresenceState }
  | { kind: "presence-leave"; clientId: ClientId }
  | { kind: "hello"; clientId: ClientId }


type WebSocketSyncOptions = {
  url: string
  clientId: ClientId
  initialPresence?: PresenceState
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
}: WebSocketSyncOptions): SyncAdapter => {
  const ws = new WebSocket(url)
  const batchListeners = new Set<(batch: OpBatch) => void>()
  const presenceListeners = new Set<(clientId: ClientId, state: PresenceState | null) => void>()
  let lastLocalPresence = initialPresence
  let openSent = false
  const outbox: WireMessage[] = []

  const send = (msg: WireMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    } else {
      outbox.push(msg)
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
    let msg: WireMessage
    try {
      msg = JSON.parse(typeof e.data === "string" ? e.data : "") as WireMessage
    } catch {
      return
    }
    if (msg.kind === "batch") {
      // The server excludes the sender already, but guard against echo
      // in case the wire is ever reused without that guarantee.
      if (msg.batch.clientId === clientId) return
      for (const cb of batchListeners) cb(msg.batch)
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
    }
  })

  ws.addEventListener("close", (e) => {
    if (e.code !== 1000 && e.code !== 1001) {
      console.warn(`collab: ws closed code=${e.code} reason=${e.reason || "(none)"}`)
    }
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
      send({ kind: "batch", batch })
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
