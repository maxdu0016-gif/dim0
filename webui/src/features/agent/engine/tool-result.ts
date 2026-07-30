/**
 * Uniform result contract for a single tool call in the browser agent loop.
 *
 * A successful call returns the tool's own output verbatim. A failure — the user
 * declining an off-board tool, an unknown tool, or a thrown error — is shaped
 * here into a structured, model-directed object instead of a terse, inconsistent
 * string. `error` is a stable machine code (for the UI / telemetry); `message`
 * is the natural-language guidance the model reads, so it understands what
 * happened and what to do next (e.g. that web search was refused, and why).
 *
 * This is the frontend analog of the backend's tool decorator error contract —
 * keeping both runtimes' tool-error semantics aligned as the server agent is
 * retired.
 */


export type ToolErrorCode = "user_declined" | "unknown_tool" | "tool_error"


/** A structured tool-call failure fed back to the model as the tool result. */
export type ToolFailure = {
  ok: false
  error: ToolErrorCode
  tool: string
  message: string
}


/** True when a tool result is a structured failure (vs a tool's own output). */
export const isToolFailure = (result: unknown): result is ToolFailure =>
  typeof result === "object" &&
  result !== null &&
  (result as { ok?: unknown }).ok === false &&
  typeof (result as { message?: unknown }).message === "string"


/**
 * The user declined an off-board tool at the confirm gate. Framed as a
 * permission choice (not a failure) with an explicit do-not-retry, so the model
 * neither loops nor causes the dialog to reopen.
 */
export const userDeclined = (tool: string): ToolFailure => ({
  ok: false,
  error: "user_declined",
  tool,
  message:
    `The user declined to approve the "${tool}" tool for this request. This is a ` +
    `permission choice, not a failure or a transient error. Do not call "${tool}" ` +
    `again for this request. Continue using what you already know; if the task ` +
    `genuinely requires it, briefly tell the user you could not use "${tool}" ` +
    `because the request was not approved.`,
})


/** The model called a tool that isn't in this run's toolset. */
export const unknownTool = (tool: string): ToolFailure => ({
  ok: false,
  error: "unknown_tool",
  tool,
  message:
    `There is no tool named "${tool}". Only call tools that were provided to you. ` +
    `Pick a valid tool for this step, or answer directly if none applies.`,
})


/** A tool threw while running (e.g. a managed service 500 or a network error). */
export const toolThrew = (tool: string, err: unknown): ToolFailure => ({
  ok: false,
  error: "tool_error",
  tool,
  message:
    `The "${tool}" tool failed with an error: ${err instanceof Error ? err.message : String(err)}. ` +
    `You may retry once if this looks transient; otherwise continue without it and ` +
    `tell the user what could not be completed.`,
})
