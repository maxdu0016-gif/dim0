/**
 * Frontend agent engine types (A4).
 *
 * `LlmClient` is the swappable boundary: a scripted mock (tests) and a real
 * BYOK OpenAI-compatible client both implement it, so the loop + tools are
 * tested with zero network. Tools are OURS and run LOCALLY against the canvas
 * store; the loop emits `AgentEvent`s the UI maps onto its stream.
 */
import { z } from "zod"
import type { CanvasStore } from "@canvas-harness/core"
import type { BoardRegistry } from "@/features/board/persist/local/board-registry"
import type { LocalSearchIndex } from "@/features/board/search/local-index"


export type LlmToolCall = { id: string; name: string; arguments: string }


export type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: LlmToolCall[] }
  | { role: "tool"; toolCallId: string; content: string }


/** One model turn: either a final answer or a set of tool calls. */
export type LlmTurn =
  | { kind: "text"; text: string }
  | { kind: "tool_calls"; calls: LlmToolCall[] }


export type LlmToolDef = {
  name: string
  description: string
  parameters: Record<string, unknown>
}


export interface LlmClient {
  complete(messages: LlmMessage[], tools: LlmToolDef[]): Promise<LlmTurn>
}


/** Capabilities a tool may need. Search/registry are optional (board-scoped). */
export type ToolContext = {
  store: CanvasStore
  /**
   * Current folder layer new notes/links belong to (null = root). Tools stamp
   * it as `parentId` AT CREATION — the local analog of the backend passing
   * `root_id` to `build_note`, so a note is born in the right sub-board rather
   * than relying on a post-hoc rescope.
   */
  rootId?: string | null
  search?: LocalSearchIndex
  registry?: BoardRegistry
}


export type Tool = {
  name: string
  description: string
  /** Zod schema for the arguments; the agent loop converts it to JSON Schema for the LLM. */
  parameters: z.ZodType
  run: (args: unknown, ctx: ToolContext) => Promise<unknown>
}


/**
 * Define a tool from a Zod parameter schema — the single source of truth. The
 * schema types `run`'s args, validates the model's tool call at runtime, and (via
 * the agent loop) becomes the JSON Schema the LLM sees. Invalid arguments return a
 * structured error instead of throwing, so the model can correct itself next turn.
 * This mirrors how the mainstream TS agent frameworks (Vercel AI SDK, OpenAI
 * Agents SDK) define tools.
 */
export const defineTool = <S extends z.ZodType>(def: {
  name: string
  description: string
  parameters: S
  run: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>
}): Tool => ({
  name: def.name,
  description: def.description,
  parameters: def.parameters,
  run: async (args, ctx) => {
    const parsed = def.parameters.safeParse(args)
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")
      return { error: `invalid arguments: ${detail}` }
    }
    return def.run(parsed.data, ctx)
  },
})


export type AgentEvent =
  | { type: "tool_start"; toolName: string; args: unknown }
  | { type: "tool_result"; toolName: string; result: unknown }
  | { type: "assistant_text"; text: string }
  | { type: "done" }
