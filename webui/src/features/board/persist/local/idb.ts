/**
 * IndexedDB schema + opener for local persistence.
 *
 * Stores:
 *   - `snapshots`     — materialized BoardContent per board (key = boardId).
 *   - `oplog`         — committed OpBatches since the last snapshot ([boardId, seq]).
 *   - `boards`        — BoardMeta (local board index), key = id.
 *   - `views`         — per-device BoardView (camera/selection), key = boardId.
 *   - `chats`         — chat metadata, key = id (chatUid). Mirrors backend Postgres.
 *   - `chat_messages` — agent transcript ([chatUid, id]). Mirrors backend Qdrant
 *                       (keyed store, no embeddings). Survives reloads.
 *
 * See offline-first-data-model.md.
 */
import { openDB } from "idb"
import type { DBSchema, IDBPDatabase } from "idb"
import type { OpBatch } from "@canvas-harness/core"
import type { ChatMessage } from "@/features/agent/types/chat"
import type { BoardContent, BoardMeta, BoardView } from "@/features/board/model"


export type SnapshotRecord = { content: BoardContent; seq: number }


export type OplogRecord = { boardId: string; seq: number; batch: OpBatch }


export type ChatRecord = { id: string; boardId: string; label?: string; updatedAt: number }


interface Dim0DB extends DBSchema {
  snapshots: { key: string; value: SnapshotRecord }
  oplog: { key: [string, number]; value: OplogRecord }
  boards: { key: string; value: BoardMeta }
  views: { key: string; value: BoardView }
  chats: { key: string; value: ChatRecord; indexes: { "by-board": string } }
  // `order` records insertion order — message ids don't sort to conversation
  // order (assistant is minted before user; counter sorts lexically), so reads
  // must sort by this, not by the key.
  chat_messages: { key: [string, string]; value: ChatMessage & { order?: number } }
  // Per-note mini-app widget state (local analog of backend /mini-app-state).
  mini_app_state: { key: string; value: { noteId: string; state: unknown } }
}


export type Dim0Database = IDBPDatabase<Dim0DB>


const DB_NAME = "dim0"
const DB_VERSION = 4


/** Open (creating/upgrading) the dim0 database. `name` is overridable for tests. */
export const openDim0Db = (name: string = DB_NAME): Promise<Dim0Database> =>
  openDB<Dim0DB>(name, DB_VERSION, {
    // Idempotent: creates whatever's missing, so fresh installs and upgrades
    // (v1→ adds chat stores, v2→ adds the chats by-board index) converge.
    upgrade(db, _oldVersion, _newVersion, tx) {
      if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots")
      if (!db.objectStoreNames.contains("oplog")) db.createObjectStore("oplog", { keyPath: ["boardId", "seq"] })
      if (!db.objectStoreNames.contains("boards")) db.createObjectStore("boards", { keyPath: "id" })
      if (!db.objectStoreNames.contains("views")) db.createObjectStore("views")
      const chats = db.objectStoreNames.contains("chats")
        ? tx.objectStore("chats")
        : db.createObjectStore("chats", { keyPath: "id" })
      if (!chats.indexNames.contains("by-board")) chats.createIndex("by-board", "boardId")
      if (!db.objectStoreNames.contains("chat_messages")) db.createObjectStore("chat_messages", { keyPath: ["chatUid", "id"] })
      if (!db.objectStoreNames.contains("mini_app_state")) db.createObjectStore("mini_app_state", { keyPath: "noteId" })
    },
  })
