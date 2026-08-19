/**
 * Board drift signal (Phase 4) — a deterministic, LLM-free magnitude-of-change
 * heuristic that decides WHEN the board purpose is worth re-deriving. The LLM does
 * the semantics; this only measures how much changed since the last derive, from
 * the same oplog tail the snapshot reads (`readRecentOps`).
 */
import type { OplogRecord } from "@/features/board/persist/local/idb"


/** Content mass added/edited (primary) + distinct nodes touched (fallback). */
export type BoardDrift = { charsChanged: number; nodesTouched: number }


/** Enough content mass changed (≈ /4 tokens) to re-look at the purpose. */
export const BOARD_DRIFT_CHARS = 1500
/** OR enough distinct nodes touched (covers deletes + structural churn). */
export const BOARD_DRIFT_NODES = 8
/** OR stale by this many days (time floor for slow semantic drift). */
export const BOARD_DRIFT_DAYS = 14


const DAY_MS = 86_400_000


/** The content mass of a node: its label + body length. */
const nodeMass = (node: unknown): number => {
  const n = node as { content?: string; data?: { label?: { markdown?: string } } }
  return (n.data?.label?.markdown?.length ?? 0) + (n.content?.length ?? 0)
}


/**
 * Measure drift over an oplog tail: sum content mass of added/updated nodes
 * (primary) and count distinct nodes touched (fallback, so deletes + churn that
 * carry no new content still register). Non-node ops (edges/groups/frames) don't
 * move a content summary and are ignored.
 */
export const boardDriftSince = (recentOps: OplogRecord[]): BoardDrift => {
  let charsChanged = 0
  const touched = new Set<string>()
  for (const rec of recentOps) {
    for (const op of rec.batch.ops) {
      if (op.type === "node.add") {
        touched.add(String(op.node.id))
        charsChanged += nodeMass(op.node)
      } else if (op.type === "node.update") {
        touched.add(String(op.id))
        // Approx edit delta — over-counts slightly (whole patch), harmless for a
        // magnitude gate; the true field-level delta isn't worth reconstructing.
        charsChanged += JSON.stringify(op.patch ?? {}).length
      } else if (op.type === "node.remove") {
        // Structural churn only — a delete adds no content mass, but bumps the
        // node-count fallback so a big prune still trips the gate.
        touched.add(String(op.node.id))
      }
    }
  }
  return { charsChanged, nodesTouched: touched.size }
}


/**
 * Whether the board purpose should be re-derived: never derived, OR enough content
 * mass changed, OR enough nodes touched, OR stale by the time floor. A pure gate —
 * the caller supplies `now` and the board's stored fingerprint.
 */
export const shouldDerivePurpose = (
  meta: { context?: string; contextDerivedAt?: number },
  drift: BoardDrift,
  now: number,
): boolean =>
  !meta.context ||
  drift.charsChanged >= BOARD_DRIFT_CHARS ||
  drift.nodesTouched >= BOARD_DRIFT_NODES ||
  now - (meta.contextDerivedAt ?? 0) >= BOARD_DRIFT_DAYS * DAY_MS
