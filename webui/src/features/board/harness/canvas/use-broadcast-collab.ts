import { useEffect } from "react"
import { attachSync, type CanvasStore } from "@canvas-harness/core"
import { createBroadcastSyncAdapter } from "@canvas-harness/sync-broadcast"
import { useAppStore } from "@/store"


/**
 * Same-machine multi-tab collab via canvas-harness's BroadcastChannel
 * adapter. Each tab on the same board joins a shared channel keyed by
 * boardId+rootId; local op batches forward to peers, remote batches
 * apply as `origin:'remote'` (the save loop already skips those).
 *
 * This is the Phase 0 spike — proves the client integration end-to-end
 * before we build the WebSocket transport in Phase 1. Cross-machine
 * collab needs a server-backed adapter; that lands separately.
 *
 * Presence is seeded with the signed-in user's display name + a
 * deterministic-ish color so two tabs of the same person look like
 * the same person.
 */
export const useBroadcastCollab = (
  store: CanvasStore,
  boardId: string | null,
  rootId: string | null,
  enabled: boolean,
): void => {
  // No display-name field on the app store today — derive a label
  // from the email's local part so peers see something readable.
  const userEmail = useAppStore((s) => s.userEmail)
  const userId = useAppStore((s) => s.userId)
  const userName = userEmail.split("@")[0] || "Anonymous"

  useEffect(() => {
    if (!enabled || !boardId) return

    // Channel name scopes peers to the same board + folder.
    // Different boards / folders sit on different channels.
    const channelName = `dim0:board:${boardId}:${rootId ?? "root"}`
    const color = colorForId(userId ?? store.clientId)

    // Seed local presence so peers can label our cursor immediately.
    store.presence.setLocal({
      name: userName || "Anonymous",
      color,
      cursor: null,
      selection: [],
      editing: null,
    })

    const adapter = createBroadcastSyncAdapter({
      channelName,
      clientId: store.clientId,
      initialPresence: store.presence.getLocal(),
    })

    const detach = attachSync(store, adapter)

    return () => {
      detach()
      // Clear local presence so a re-attach doesn't echo stale state.
      store.presence.setLocal({ cursor: null, selection: [], editing: null })
    }
  }, [store, boardId, rootId, enabled, userName, userId, userEmail])
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
