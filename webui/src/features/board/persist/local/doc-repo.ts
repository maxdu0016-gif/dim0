/**
 * DocRepo — per-board uploaded documents + their retrieval chunks, over the
 * `StorageEngine` port (document Q&A, F2 B4).
 *
 * A document's OCR'd markdown isn't stored whole; it lives as `chunks` (the
 * retrieval unit). Chunks carry `boardId` (rebuild the board's search index on
 * load) and `docId` (cascade + citation chunk→doc mapping). Deleting a document
 * cascades its chunks in one transaction so nothing is orphaned.
 */
import type { ChunkRecord, DocumentRecord } from "./idb"
import type { StorageEngine } from "./engine"


/** A single-key range (inclusive both ends) — used for exact index lookups. */
const eq = (value: string) => ({ lower: value, upper: value })


export class DocRepo {
  private readonly engine: StorageEngine


  constructor(engine: StorageEngine) {
    this.engine = engine
  }


  /** Insert or replace a document's metadata. */
  async addDocument(doc: DocumentRecord): Promise<void> {
    await this.engine.put("documents", doc)
  }


  /** Fetch one document's metadata. */
  async getDocument(id: string): Promise<DocumentRecord | undefined> {
    return this.engine.get<DocumentRecord>("documents", id)
  }


  /** All documents attached to a board, in insertion order. */
  async listDocuments(boardId: string): Promise<DocumentRecord[]> {
    return this.engine.list<DocumentRecord>("documents", { index: "by-board", range: eq(boardId) })
  }


  /** Persist a document's chunks (one transaction). */
  async addChunks(chunks: ChunkRecord[]): Promise<void> {
    if (chunks.length === 0) return
    await this.engine.tx(["chunks"], async (t) => {
      for (const c of chunks) await t.put("chunks", c)
    })
  }


  /** Every chunk on a board (to rebuild the board's search index at load). */
  async chunksForBoard(boardId: string): Promise<ChunkRecord[]> {
    return this.engine.list<ChunkRecord>("chunks", { index: "by-board", range: eq(boardId) })
  }


  /** The chunks of one document. */
  async chunksForDoc(docId: string): Promise<ChunkRecord[]> {
    return this.engine.list<ChunkRecord>("chunks", { index: "by-doc", range: eq(docId) })
  }


  /** Delete a document and all its chunks atomically. */
  async deleteDocument(docId: string): Promise<void> {
    await this.engine.tx(["documents", "chunks"], async (t) => {
      const chunks = await t.list<ChunkRecord>("chunks", { index: "by-doc", range: eq(docId) })
      for (const c of chunks) await t.delete("chunks", c.chunkId)
      await t.delete("documents", docId)
    })
  }
}
