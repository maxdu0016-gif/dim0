/**
 * IndexedDB schema + opener for local board persistence (A1/A2).
 *
 * Stores (all keyed per board):
 *   - `snapshots` — one materialized BoardContent per board (key = boardId).
 *   - `oplog`     — committed OpBatches since the last snapshot, keyed
 *                   [boardId, seq] so a board's tail is a contiguous range.
 *   - `boards`    — BoardMeta (local-only boards + cached synced ones), key = id.
 *   - `views`     — per-device BoardView (camera/selection), key = boardId.
 *
 * The snapshot's `seq` is the highest op seq it already includes; oplog entries
 * with a greater seq are replayed on load. See offline-first-data-model.md.
 */
import { openDB } from "idb"
import type { DBSchema, IDBPDatabase } from "idb"
import type { OpBatch } from "@canvas-harness/core"
import type { BoardContent, BoardMeta, BoardView } from "@/features/board/model"


export type SnapshotRecord = { content: BoardContent; seq: number }


export type OplogRecord = { boardId: string; seq: number; batch: OpBatch }


interface Dim0DB extends DBSchema {
  snapshots: { key: string; value: SnapshotRecord }
  oplog: { key: [string, number]; value: OplogRecord }
  boards: { key: string; value: BoardMeta }
  views: { key: string; value: BoardView }
}


export type Dim0Database = IDBPDatabase<Dim0DB>


const DB_NAME = "dim0"
const DB_VERSION = 1


/** Open (creating/upgrading) the dim0 database. `name` is overridable for tests. */
export const openDim0Db = (name: string = DB_NAME): Promise<Dim0Database> =>
  openDB<Dim0DB>(name, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("snapshots")
      db.createObjectStore("oplog", { keyPath: ["boardId", "seq"] })
      db.createObjectStore("boards", { keyPath: "id" })
      db.createObjectStore("views")
    },
  })
