/**
 * The agent loop (A4). Drives an `LlmClient` through tool-calling turns against
 * the local tools, emitting `AgentEvent`s. Provider-agnostic and network-free by
 * construction — the LLM is injected, so tests use a scripted mock.
 */
import { z } from "zod"
import type { AgentEvent, LlmClient, LlmMessage, LlmToolDef, LlmTurn, Tool, ToolContext } from "./types"
import { toolThrew, unknownTool, userDeclined } from "./tool-result"
import { agentLog } from "./debug"


/**
 * Safety cap on tool-calling rounds for a single turn. High enough for complex
 * multi-step builds, bounded so a misbehaving model can't loop forever (each
 * round is a billed LLM call). Override per-run via `RunAgentOptions.maxTurns`.
 */
export const DEFAULT_MAX_TURNS = 30


/**
 * Tools that reach OFF the board — network egress (`fetch`, `web_search`) and
 * code execution (`code_interpreter`). When a confirmer is wired (see `ToolContext.confirmTool`)
 * these require an explicit user OK before running, so a prompt-injected tool
 * call (from a selected note / uploaded doc) can't silently exfiltrate board
 * data or run attacker code. Note tools stay auto — they act on the user's own
 * board and gating them would wreck the normal build flow.
 */
const CONFIRM_TOOLS = new Set(["fetch", "code_interpreter", "web_search"])


/** Convert a tool's Zod schema to a plain JSON Schema (dropping the `$schema` tag). */
const toJsonSchema = (schema: z.ZodType): Record<string, unknown> => {
  const json = z.toJSONSchema(schema) as Record<string, unknown>
  delete json.$schema
  return json
}


/** Reduce tools to the name/description/parameters the LLM needs. */
const toDefs = (tools: Tool[]): LlmToolDef[] =>
  tools.map((t) => ({ name: t.name, description: t.description, parameters: toJsonSchema(t.parameters) }))


/** Parse a tool call's JSON arguments, tolerating malformed/non-object input. */
const parseArgs = (raw: string): Record<string, unknown> => {
  try {
    const v: unknown = JSON.parse(raw)
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}


/**
 * Execute one tool call under the loop's policy and return the model-facing
 * result: the tool's own output on success, or a structured `ToolFailure`
 * (unknown tool / user-declined / thrown error) the model can act on. The
 * single choke point for tool execution — the frontend analog of the backend's
 * tool decorator, so every failure origin yields one consistent shape.
 *
 * The off-board confirm gate de-dupes per run via `declinedTools`: once the user
 * declines a tool, a later call to the same tool fails closed WITHOUT reopening
 * the dialog, so a retrying model can't nag the user with repeat prompts.
 */
export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  tools: Tool[],
  ctx: ToolContext,
  declinedTools: Set<string>,
): Promise<unknown> {
  const tool = tools.find((t) => t.name === name)
  if (!tool) return unknownTool(name)

  // Confirm gate + run share one try/catch, so neither a throwing confirmer nor
  // a throwing tool aborts the whole run — both surface as a `tool_error`.
  try {
    if (CONFIRM_TOOLS.has(tool.name) && ctx.confirmTool) {
      if (declinedTools.has(tool.name)) return userDeclined(tool.name)
      const approved = await ctx.confirmTool({ name: tool.name, args })
      if (!approved) {
        declinedTools.add(tool.name)
        return userDeclined(tool.name)
      }
    }
    return await tool.run(args, ctx)
  } catch (err) {
    return toolThrew(tool.name, err)
  }
}


export type RunAgentOptions = {
  userMessage: string
  tools: Tool[]
  llm: LlmClient
  ctx: ToolContext
  system?: string
  /** Prior conversation turns, prepended so the agent remembers the chat. */
  history?: LlmMessage[]
  maxTurns?: number
}


/** Run the agent, yielding events as tools execute and the answer streams. */
export async function* runAgent(opts: RunAgentOptions): AsyncGenerator<AgentEvent> {
  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS
  const defs = toDefs(opts.tools)
  const messages: LlmMessage[] = []
  if (opts.system) messages.push({ role: "system", content: opts.system })
  if (opts.history) messages.push(...opts.history)
  messages.push({ role: "user", content: opts.userMessage })

  // Off-board tools the user declined this run — never re-prompted (see
  // executeToolCall). Spans all turns, so a retry in a later round is caught.
  const declinedTools = new Set<string>()

  for (let turn = 0; turn < maxTurns; turn += 1) {
    // Prefer streaming: emit cumulative `assistant_text` per delta so the UI
    // renders token-by-token; fall back to a single atomic turn otherwise.
    let result: LlmTurn
    if (opts.llm.completeStream) {
      let acc = ""
      let final: LlmTurn | null = null
      for await (const ev of opts.llm.completeStream(messages, defs)) {
        if (ev.kind === "delta") {
          acc += ev.text
          yield { type: "assistant_text", text: acc }
        } else if (ev.kind === "tool_start") {
          // Early signal: show the tool the moment its name is known; args are
          // filled in when the call actually runs below.
          yield { type: "tool_start", toolName: ev.name, args: {} }
        } else {
          final = ev.turn
        }
      }
      result = final ?? { kind: "text", text: acc }
    } else {
      result = await opts.llm.complete(messages, defs)
    }

    if (result.kind === "text") {
      messages.push({ role: "assistant", content: result.text })
      yield { type: "assistant_text", text: result.text }
      yield { type: "done" }
      return
    }

    messages.push({ role: "assistant", content: "", toolCalls: result.calls })
    for (const call of result.calls) {
      const args = parseArgs(call.arguments)
      yield { type: "tool_start", toolName: call.name, args }
      // One choke point: unknown-tool guard, the off-board confirm gate, and
      // error normalization all live in executeToolCall, so every outcome —
      // declined, unknown, or thrown — feeds back one consistent structured
      // result and no failure origin aborts the run.
      const output = await executeToolCall(call.name, args, opts.tools, opts.ctx, declinedTools)
      agentLog.tool(call.name, args, output)
      yield { type: "tool_result", toolName: call.name, result: output }
      messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(output) })
    }
  }

  yield { type: "done" }
}
