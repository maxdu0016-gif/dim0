/**
 * Local board registry (A2) — metadata + per-device view state in IndexedDB.
 *
 * Stores `BoardMeta` (the local board index, incl. local-only boards) and
 * `BoardView` (camera/selection, per device). Board *content* lives in the
 * snapshot/oplog stores owned by BoardPersistence; `deleteBoard` cascades across
 * all of them in one transaction so a removed board leaves no orphans.
 *
 * No accounts required: local-only boards are created and listed fully offline.
 */
import { v4 as uuidv4 } from "uuid"
import type { BoardMeta, BoardView } from "@/features/board/model"
import { openDim0Db } from "./idb"
import type { Dim0Database } from "./idb"


/** Build a fresh local-only board's metadata. `now` is epoch ms (injectable). */
export const newLocalBoard = (title: string, now: number): BoardMeta => ({
  id: uuidv4(),
  title,
  kind: "local-only",
  visibility: "private",
  createdAt: now,
  updatedAt: now,
})


export class BoardRegistry {
  private db: Dim0Database | null = null
  private readonly dbName?: string


  constructor(dbName?: string) {
    this.dbName = dbName
  }


  /** Open the database. Must be called before any other method. */
  async init(): Promise<void> {
    this.db = await openDim0Db(this.dbName)
  }


  /** Insert or replace a board's metadata. */
  async createBoard(meta: BoardMeta): Promise<void> {
    await this.requireDb().put("boards", meta)
  }


  /** Fetch one board's metadata. */
  async getBoard(id: string): Promise<BoardMeta | undefined> {
    return this.requireDb().get("boards", id)
  }


  /** List all non-deleted boards (the local board index). */
  async listBoards(): Promise<BoardMeta[]> {
    const all = await this.requireDb().getAll("boards")
    return all.filter((b) => !b.deletedAt)
  }


  /** Rename a board (no-op if it doesn't exist). Used by describe_board auto-label. */
  async renameBoard(id: string, title: string, now: number = Date.now()): Promise<void> {
    const db = this.requireDb()
    const existing = await db.get("boards", id)
    if (!existing) return
    await db.put("boards", { ...existing, title, updatedAt: now })
  }


  /** Delete a board and ALL its data (meta + view + snapshot + oplog) atomically. */
  async deleteBoard(id: string): Promise<void> {
    const db = this.requireDb()
    const tx = db.transaction(["boards", "views", "snapshots", "oplog"], "readwrite")
    await tx.objectStore("boards").delete(id)
    await tx.objectStore("views").delete(id)
    await tx.objectStore("snapshots").delete(id)
    await tx.objectStore("oplog").delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]))
    await tx.done
  }


  /** Persist per-device view state (camera/selection) for a board. */
  async saveView(id: string, view: BoardView): Promise<void> {
    await this.requireDb().put("views", view, id)
  }


  /** Load per-device view state, or undefined if none saved. */
  async loadView(id: string): Promise<BoardView | undefined> {
    return this.requireDb().get("views", id)
  }


  /** Close the database connection. */
  close(): void {
    this.db?.close()
    this.db = null
  }


  private requireDb(): Dim0Database {
    if (!this.db) throw new Error("BoardRegistry.init() must be called first")
    return this.db
  }
}
