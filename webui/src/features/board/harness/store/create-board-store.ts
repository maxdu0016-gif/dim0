import { createCanvasStore, defineNode } from "@canvas-harness/core"
import type { CanvasStore } from "@canvas-harness/core"


/** Inferred shape of a defineNode result — canvas-harness doesn't re-export the bare type. */
export type BoardNodeTypeDef = ReturnType<typeof defineNode>


export type CreateBoardStoreOptions = {
  /** Custom node defs registered with the canvas store. Phase 3 populates this with sheet / code-sandbox / widget / etc. */
  nodeTypes?: BoardNodeTypeDef[]
}


/**
 * Factory for the canvas-harness store backing a Dim0 board. Thin
 * wrapper today — exists so the rest of the app imports from a single
 * `harness/store` entry point and so we can layer board-level
 * conventions (logging, presence wiring, etc.) without touching call
 * sites later.
 */
export const createBoardStore = (opts: CreateBoardStoreOptions = {}): CanvasStore =>
  createCanvasStore({ nodeTypes: opts.nodeTypes ?? [] })
