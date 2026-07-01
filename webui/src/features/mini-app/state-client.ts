// Host-side client for per-note mini-app widget state — thin wrappers over
// `MiniAppRepo`.
//
// Local-first: state lives in IndexedDB (the `mini_app_state` store), the local
// analog of the backend's /mini-app-state endpoints. Used by MiniAppMount to
// hydrate the iframe's host.initialState and to persist whatever the widget
// passes to host.saveState. Each call opens a short-lived engine; the
// composition root (D.0 step 4) will swap in a shared engine + injected repo.

import { IndexedDbEngine } from "@/features/board/persist/local/indexeddb-engine"
import { MiniAppRepo } from "./mini-app-repo"


/** Run `fn` with a short-lived engine + repo, closing the engine afterwards. */
async function withRepo<T>(fn: (repo: MiniAppRepo) => Promise<T>): Promise<T> {
  const engine = await IndexedDbEngine.open()
  try {
    return await fn(new MiniAppRepo(engine))
  } finally {
    engine.close()
  }
}


/**
 * Fetch the saved state for the given note. Returns the stored value (which may
 * itself be any JSON, including ``null``) or ``undefined`` when none exists.
 */
export function fetchMiniAppState(noteId: string): Promise<unknown> {
  return withRepo((repo) => repo.getState(noteId))
}


/**
 * Persist the given state for the note. Overwrites any previous value — widget
 * state has no history in v1.
 */
export function saveMiniAppState(noteId: string, state: unknown): Promise<void> {
  return withRepo((repo) => repo.putState(noteId, state))
}
