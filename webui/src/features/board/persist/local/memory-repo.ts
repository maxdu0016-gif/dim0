/**
 * MemoryRepo — the agent's durable facts (board + global scope) over the
 * `StorageEngine` port (Phase 3 of the agent-context work).
 *
 * Writes are additive with `hash` dedup (no LLM mutation loop): an identical fact
 * is a no-op, and a write that would push a scope past its char cap is REJECTED
 * with the current entries returned, so the model can consolidate and retry in the
 * same turn. Deletes are soft (tombstones) so a removal can propagate under sync
 * (Phase 7); `list` hides tombstoned records.
 *
 * `bucket` (`board:<id>` | `global`) collapses (scope, boardId) into one indexed
 * string — global's null `boardId` can't ride a compound index, so the bucket is
 * the single lookup key for both scopes.
 */
import type { MemoryKind, MemoryRecord, MemoryScope } from "./idb"
import type { StorageEngine } from "./engine"


/** A single-key index range (inclusive both ends) — exact bucket lookup. */
const eq = (value: string) => ({ lower: value, upper: value })


/** Per-scope character budget (model-independent, Hermes-style). Tune later. */
export const BOARD_MEM_CHARS = 4000
export const GLOBAL_MEM_CHARS = 4000


/** The indexable bucket key for a (scope, boardId) pair. */
export const memoryBucket = (scope: MemoryScope, boardId: string | null): string =>
  scope === "board" ? `board:${boardId ?? ""}` : "global"


/** Normalize a fact body for hashing: trim, collapse inner whitespace, lowercase. */
const normalizeBody = (body: string): string => body.trim().replace(/\s+/g, " ").toLowerCase()


/** Deterministic 32-bit string hash (djb2) as hex — enough for dedup, no crypto. */
export const memoryHash = (body: string): string => {
  const s = normalizeBody(body)
  let h = 5381
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}


/** The char weight of a record toward its scope cap (the fact + its retrieval key). */
const recordChars = (r: MemoryRecord): number => r.title.length + r.summary.length + r.body.length


export type AddResult = { ok: true; record: MemoryRecord } | { ok: false; reason: "over_cap"; entries: MemoryRecord[] }


export class MemoryRepo {
  private readonly engine: StorageEngine


  constructor(engine: StorageEngine) {
    this.engine = engine
  }


  /** Live (non-tombstoned) records for a scope, oldest first. */
  async list(scope: MemoryScope, boardId: string | null): Promise<MemoryRecord[]> {
    const all = await this.engine.list<MemoryRecord>("memories", { index: "by-bucket", range: eq(memoryBucket(scope, boardId)) })
    return all.filter((r) => !r.deleted).sort((a, b) => a.createdAt - b.createdAt)
  }


  /** The live record in this scope with a matching body hash, if any (dedup probe). */
  async findByHash(scope: MemoryScope, boardId: string | null, hash: string): Promise<MemoryRecord | undefined> {
    const entries = await this.list(scope, boardId)
    return entries.find((r) => r.hash === hash)
  }


  /** Total char weight of a scope's live records (capacity display + cap check). */
  async charCount(scope: MemoryScope, boardId: string | null): Promise<number> {
    const entries = await this.list(scope, boardId)
    return entries.reduce((sum, r) => sum + recordChars(r), 0)
  }


  /**
   * Additively save a fact. An identical body (same hash) returns the existing
   * record unchanged. A write that would exceed the scope's char cap is rejected
   * with the current entries, so the caller consolidates and retries.
   */
  async add(input: {
    scope: MemoryScope
    boardId: string | null
    kind: MemoryKind
    title: string
    summary: string
    body: string
    id: string
    now: number
  }): Promise<AddResult> {
    const { scope, boardId } = input
    const entries = await this.list(scope, boardId)
    const hash = memoryHash(input.body)
    const existing = entries.find((r) => r.hash === hash)
    if (existing) return { ok: true, record: existing }

    const cap = scope === "board" ? BOARD_MEM_CHARS : GLOBAL_MEM_CHARS
    const used = entries.reduce((sum, r) => sum + recordChars(r), 0)
    const incoming = input.title.length + input.summary.length + input.body.length
    if (used + incoming > cap) return { ok: false, reason: "over_cap", entries }

    const record: MemoryRecord = {
      id: input.id,
      scope,
      boardId: scope === "board" ? boardId : null,
      bucket: memoryBucket(scope, boardId),
      kind: input.kind,
      title: input.title,
      summary: input.summary,
      body: input.body,
      hash,
      createdAt: input.now,
      updatedAt: input.now,
      dirty: true,
      serverRev: null,
    }
    await this.engine.put("memories", record)
    return { ok: true, record }
  }


  /** Patch a record's editable fields; re-hashes when the body changes. */
  async update(id: string, patch: Partial<Pick<MemoryRecord, "title" | "summary" | "body" | "kind">>, now: number): Promise<void> {
    const current = await this.engine.get<MemoryRecord>("memories", id)
    if (!current) return
    const body = patch.body ?? current.body
    const next: MemoryRecord = {
      ...current,
      ...patch,
      body,
      hash: patch.body !== undefined ? memoryHash(body) : current.hash,
      updatedAt: now,
      dirty: true,
    }
    await this.engine.put("memories", next)
  }


  /** Soft-delete: mark a tombstone so the removal survives a reload / propagates. */
  async remove(id: string, now: number): Promise<void> {
    const current = await this.engine.get<MemoryRecord>("memories", id)
    if (!current) return
    await this.engine.put("memories", { ...current, deleted: true, updatedAt: now, dirty: true })
  }
}
