/**
 * Enable-sync orchestrator: promote a local-only board to synced (local → synced).
 *
 * The state machine, with deps injected so it unit-tests without IndexedDB or
 * the network. Order matters for retry-safety:
 *   1. load the board's full content and adopt it on the server,
 *   2. compact the local store so the outbox has nothing pending — otherwise the
 *      v2 coordinator would re-upload the whole history the server just ingested,
 *   3. mark the board synced/v2 LAST, so a failure before this leaves it local
 *      and re-runnable (adopt is idempotent, compact on an empty tail is a no-op).
 */
import type { Op } from "@canvas-harness/core"
import type { BoardContent } from "@/features/board/model"


export type EnableSyncResult =
  | { ok: true; boardId: string }
  | { ok: false; reason: "signed-out" }
  | { ok: false; reason: "error"; error: unknown }


/** Serialize board content into a batch of wire add-ops for the adopt endpoint. */
export const contentToAddOps = (content: BoardContent): Op[] => {
  const ops: Op[] = []
  for (const node of content.nodes) ops.push({ type: "node.add", node })
  for (const edge of content.edges) ops.push({ type: "edge.add", edge })
  return ops
}


export type EnableSyncDeps = {
  signedIn: boolean
  ownerId: string
  loadContent: () => Promise<BoardContent>
  adopt: (ops: Op[]) => Promise<void>
  compact: () => Promise<void>
  markSynced: (ownerId: string) => Promise<void>
}


/** Run the promotion. Returns a discriminated result; never throws. */
export const enableSync = async (
  boardId: string,
  deps: EnableSyncDeps,
): Promise<EnableSyncResult> => {
  if (!deps.signedIn) return { ok: false, reason: "signed-out" }
  try {
    const content = await deps.loadContent()
    await deps.adopt(contentToAddOps(content))
    await deps.compact()
    await deps.markSynced(deps.ownerId)
    return { ok: true, boardId }
  } catch (error) {
    return { ok: false, reason: "error", error }
  }
}
