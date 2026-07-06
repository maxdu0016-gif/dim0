/**
 * Per-board sync-engine flag (dev scaffolding for the E1.5 cutover).
 *
 * Decides whether a synced board mounts the new offline-first coordinator (v2)
 * or the legacy `use-ws-collab` (default). Persisted in localStorage keyed by
 * board id so a cutover is per-board and survives reloads — the same shape the
 * real `BoardMeta.syncEngine` field will take, without a schema change yet.
 *
 * Toggle from the dev console: `dim0SyncV2.on("<boardId>")` then reload.
 * This whole module is deleted once the migration graduates to `BoardMeta`.
 */
const KEY = "dim0_sync_v2_boards"


const read = (): Set<string> => {
  try {
    const raw = localStorage.getItem(KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}


const write = (ids: Set<string>): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]))
  } catch {
    // ignore — private mode / storage disabled just means the flag doesn't stick
  }
}


/** Whether a board should mount the v2 coordinator. */
export const isBoardSyncV2 = (boardId: string): boolean => read().has(boardId)


/** Flip a board's engine (dev). Takes effect on the next mount / reload. */
export const setBoardSyncV2 = (boardId: string, on: boolean): void => {
  const ids = read()
  if (on) ids.add(boardId)
  else ids.delete(boardId)
  write(ids)
}


// Dev console bridge — attached on import (harness-canvas pulls this in).
if (typeof window !== "undefined") {
  ;(window as unknown as { dim0SyncV2?: unknown }).dim0SyncV2 = {
    on: (boardId: string) => setBoardSyncV2(boardId, true),
    off: (boardId: string) => setBoardSyncV2(boardId, false),
    list: () => [...read()],
  }
}
