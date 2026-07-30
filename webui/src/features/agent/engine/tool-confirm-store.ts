import { create } from "zustand"


/** A pending request to run an off-board tool, awaiting the user's decision. */
export type ToolConfirmRequest = { name: string; args: Record<string, unknown> }


/**
 * The user's answer to a confirm prompt:
 *  - `deny`   — don't run it (the loop also won't re-prompt this tool this run).
 *  - `once`   — run this call only; the next call to the tool prompts again.
 *  - `always` — run it, and auto-approve further calls to the SAME tool for the
 *    rest of this run (no more prompts). A deliberate broadening of consent.
 */
export type ToolConfirmDecision = "deny" | "once" | "always"


type Pending = (ToolConfirmRequest & { resolve: (decision: ToolConfirmDecision) => void }) | null


type ToolConfirmState = {
  pending: Pending
  /** Ask the user to approve a tool run; resolves with their decision. */
  request: (req: ToolConfirmRequest) => Promise<ToolConfirmDecision>
  /** Settle the pending request (from the confirm UI). No-op if nothing pending. */
  resolve: (decision: ToolConfirmDecision) => void
}


/**
 * Bridges the agent loop's `confirmTool` gate (see agent-loop `CONFIRM_TOOLS`)
 * to a React confirm dialog: `request` parks a promise + the pending request so
 * a mounted `<ToolConfirmDialog>` can render it, and `resolve` settles it. The
 * loop `await`s the promise, so a run pauses on the prompt.
 */
export const useToolConfirm = create<ToolConfirmState>((set, get) => ({
  pending: null,
  request: (req) => {
    // One prompt at a time. If one is already open (a second/concurrent run),
    // decline the NEW request rather than clobbering the prompt the user is
    // deciding on — fail closed without disturbing the in-flight decision.
    if (get().pending) return Promise.resolve("deny")
    return new Promise<ToolConfirmDecision>((resolve) => set({ pending: { ...req, resolve } }))
  },
  resolve: (decision) => {
    const p = get().pending
    if (!p) return
    p.resolve(decision)
    set({ pending: null })
  },
}))
