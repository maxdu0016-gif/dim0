/**
 * Local board persistence (A1) — snapshot + op-log via the `StorageEngine` port.
 *
 * Write path: each committed (non-remote) `change` batch is buffered and flushed
 * (debounced) to the oplog. Periodically `compact()` folds the tail into a fresh
 * snapshot. Read path: `load()` = snapshot + replay(oplog tail) → BoardContent.
 *
 * Replay reuses a throwaway canvas-harness store to apply ops, so op semantics
 * are never reimplemented. Appends are serialized through an internal queue so
 * seq assignment is monotonic; batches are de-duplicated by id (idempotency).
 *
 * Crash-safety: correctness never depends on the oplog being truncated. `load()`
 * only replays entries with `seq > snapshot.seq`, so a compaction that wrote the
 * snapshot but didn't delete the tail still loads correctly. The dangerous
 * inverse (oplog deleted without a snapshot) is prevented by doing both writes
 * in a single engine transaction (`writeSnapshot`).
 */
import { createCanvasStore } from "@canvas-harness/core"
import type { CanvasStore, OpBatch } from "@canvas-harness/core"
import type { BoardContent } from "@/features/board/model"
import { contentToScene, emptyContent, readContent } from "./codec"
import { IndexedDbEngine } from "./indexeddb-engine"
import type { StorageEngine } from "./engine"
import type { SnapshotRecord, OplogRecord } from "./idb"


export type BoardPersistenceOptions = { engine?: StorageEngine; dbName?: string; debounceMs?: number }


export class BoardPersistence {
  private engine: StorageEngine | null = null
  private readonly ownsEngine: boolean
  private seq = 0
  private queue: Promise<void> = Promise.resolve()
  private pending: OpBatch[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly seen = new Set<string>()
  private readonly boardId: string
  private readonly injectedEngine?: StorageEngine
  private readonly dbName?: string
  private readonly debounceMs: number


  constructor(boardId: string, opts: BoardPersistenceOptions = {}) {
    this.boardId = boardId
    this.injectedEngine = opts.engine
    this.dbName = opts.dbName
    this.debounceMs = opts.debounceMs ?? 50
    this.ownsEngine = !opts.engine
  }


  /** Open the engine if owned. Must be called before any other method. */
  async init(): Promise<void> {
    this.engine = this.injectedEngine ?? (await IndexedDbEngine.open(this.dbName))
  }


  /** Wire to a live store: every local committed batch is persisted. */
  attach(store: CanvasStore): () => void {
    return store.subscribe("change", (batch) => this.record(batch))
  }


  /** Buffer a committed batch for persistence (debounced). Ignores remote ops. */
  record(batch: OpBatch): void {
    if (batch.origin === "remote") return
    this.pending.push(batch)
    if (this.timer === null) {
      this.timer = setTimeout(() => this.flushPending(), this.debounceMs)
    }
  }


  /** Resolve once all buffered + queued appends have been written. */
  async flush(): Promise<void> {
    this.flushPending()
    await this.queue
  }


  /** Load the board's full content, syncing internal seq + dedupe cursors. */
  async load(): Promise<BoardContent> {
    const { content, seq } = await this.materialize()
    this.seq = seq
    return content
  }


  /**
   * Compact: snapshot current full content and truncate the folded oplog. Sets
   * the seq cursor to the snapshot's seq.
   */
  async compact(): Promise<void> {
    const { content, seq } = await this.materialize()
    await this.writeSnapshot(content, seq)
    this.seq = seq
  }


  /** Close the engine if owned, and cancel any pending flush. */
  close(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.ownsEngine) this.engine?.close()
    this.engine = null
  }


  /**
   * Write snapshot + truncate oplog atomically (one transaction). Overridable so
   * tests can simulate a crash before commit. Protected, not for app code.
   */
  protected async writeSnapshot(content: BoardContent, seq: number): Promise<void> {
    await this.requireEngine().tx(["snapshots", "oplog"], async (t) => {
      await t.put<SnapshotRecord>("snapshots", { content, seq }, this.boardId)
      await t.delete("oplog", { lower: [this.boardId, 0], upper: [this.boardId, seq] })
    })
  }


  /** Drain buffered batches into the serialized append queue. */
  private flushPending(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.pending.length === 0) return
    const batches = this.pending
    this.pending = []
    for (const batch of batches) {
      this.queue = this.queue.then(() => this.append(batch))
    }
  }


  /** Append one batch to the oplog (assigns next seq; de-dupes by batch id). */
  private async append(batch: OpBatch): Promise<void> {
    if (this.seen.has(batch.id)) return
    this.seen.add(batch.id)
    this.seq += 1
    await this.requireEngine().put<OplogRecord>("oplog", { boardId: this.boardId, seq: this.seq, batch })
  }


  /**
   * Materialize current full content (snapshot + replayed oplog tail) and the
   * highest seq it reflects. Also seeds the dedupe set with replayed batch ids.
   */
  private async materialize(): Promise<{ content: BoardContent; seq: number }> {
    const engine = this.requireEngine()
    const snap = await engine.get<SnapshotRecord>("snapshots", this.boardId)
    const base = snap?.content ?? emptyContent()
    const baseSeq = snap?.seq ?? 0
    const records = await engine.list<OplogRecord>("oplog", {
      range: { lower: [this.boardId, baseSeq], upper: [this.boardId, Number.MAX_SAFE_INTEGER], lowerOpen: true },
    })
    const seq = records.length > 0 ? records[records.length - 1].seq : baseSeq
    if (records.length === 0) return { content: base, seq }
    const store = createCanvasStore({ initial: contentToScene(base) })
    for (const r of records) {
      this.seen.add(r.batch.id)
      store.applyBatch({ ...r.batch, origin: "remote" })
    }
    return { content: readContent(store), seq }
  }


  private requireEngine(): StorageEngine {
    if (!this.engine) throw new Error("BoardPersistence.init() must be called first")
    return this.engine
  }
}
