/**
 * Frontend agent engine types (A4).
 *
 * `LlmClient` is the swappable boundary: a scripted mock (tests) and a real
 * BYOK OpenAI-compatible client both implement it, so the loop + tools are
 * tested with zero network. Tools are OURS and run LOCALLY against the canvas
 * store; the loop emits `AgentEvent`s the UI maps onto its stream.
 */
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
  search?: LocalSearchIndex
  registry?: BoardRegistry
}


export type Tool = {
  name: string
  description: string
  parameters: Record<string, unknown>
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>
}


export type AgentEvent =
  | { type: "tool_start"; toolName: string; args: unknown }
  | { type: "tool_result"; toolName: string; result: unknown }
  | { type: "assistant_text"; text: string }
  | { type: "done" }
