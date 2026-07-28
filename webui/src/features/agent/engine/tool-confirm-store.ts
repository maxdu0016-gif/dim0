import { create } from "zustand"


/** A pending request to run an off-board tool, awaiting the user's decision. */
export type ToolConfirmRequest = { name: string; args: Record<string, unknown> }


type Pending = (ToolConfirmRequest & { id: number; resolve: (ok: boolean) => void }) | null


type ToolConfirmState = {
  pending: Pending
  /** Ask the user to approve a tool run; resolves true (run) / false (decline). */
  request: (req: ToolConfirmRequest) => Promise<boolean>
  /** Settle the pending request (from the confirm UI). No-op if nothing pending. */
  resolve: (ok: boolean) => void
}


let seq = 0


/**
 * Bridges the agent loop's `confirmTool` gate (see agent-loop `CONFIRM_TOOLS`)
 * to a React confirm dialog: `request` parks a promise + the pending request so
 * a mounted `<ToolConfirmDialog>` can render it, and `resolve` settles it. The
 * loop `await`s the promise, so a run pauses on the prompt.
 */
export const useToolConfirm = create<ToolConfirmState>((set, get) => ({
  pending: null,
  request: (req) =>
    new Promise<boolean>((resolve) => {
      // Only one prompt at a time (the loop awaits each). If one is somehow
      // already open, decline it before replacing so its promise never leaks.
      const prev = get().pending
      if (prev) prev.resolve(false)
      seq += 1
      set({ pending: { ...req, id: seq, resolve } })
    }),
  resolve: (ok) => {
    const p = get().pending
    if (!p) return
    p.resolve(ok)
    set({ pending: null })
  },
}))
