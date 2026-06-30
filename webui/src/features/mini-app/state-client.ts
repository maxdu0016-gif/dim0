// Host-side client for per-note mini-app widget state.
//
// Local-first: state lives in IndexedDB (the `mini_app_state` store), the local
// analog of the backend's /mini-app-state endpoints. Used by MiniAppMount to
// hydrate the iframe's host.initialState and to persist whatever the widget
// passes to host.saveState. The shape is anything the widget JSON-serializes —
// stored opaque.

import { openDim0Db } from "@/features/board/persist/local/idb"


/**
 * Fetch the saved state for the given note. Returns the stored value (which may
 * itself be any JSON, including ``null``) or ``undefined`` when none exists.
 */
export async function fetchMiniAppState(noteId: string): Promise<unknown> {
  const db = await openDim0Db()
  try {
    const row = await db.get("mini_app_state", noteId)
    return row?.state ?? undefined
  } finally {
    db.close()
  }
}


/**
 * Persist the given state for the note. Overwrites any previous value — widget
 * state has no history in v1.
 */
export async function saveMiniAppState(noteId: string, state: unknown): Promise<void> {
  const db = await openDim0Db()
  try {
    await db.put("mini_app_state", { noteId, state })
  } finally {
    db.close()
  }
}
