/**
 * The agent loop (A4). Drives an `LlmClient` through tool-calling turns against
 * the local tools, emitting `AgentEvent`s. Provider-agnostic and network-free by
 * construction — the LLM is injected, so tests use a scripted mock.
 */
import { z } from "zod"
import type { AgentEvent, LlmClient, LlmMessage, LlmToolDef, LlmTurn, Tool, ToolContext } from "./types"
import { agentLog } from "./debug"


/**
 * Safety cap on tool-calling rounds for a single turn. High enough for complex
 * multi-step builds, bounded so a misbehaving model can't loop forever (each
 * round is a billed LLM call). Override per-run via `RunAgentOptions.maxTurns`.
 */
export const DEFAULT_MAX_TURNS = 30


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
      const tool = opts.tools.find((t) => t.name === call.name)
      const output = tool ? await tool.run(args, opts.ctx) : { error: `unknown tool: ${call.name}` }
      agentLog.tool(call.name, args, output)
      yield { type: "tool_result", toolName: call.name, result: output }
      messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(output) })
    }
  }

  yield { type: "done" }
}
