import type { ReasoningStep, ToolCallStep, ToolName } from "@/features/agent/types/stream"
import type { ToolOutput } from "@/features/agent/types/tool-outputs"
import type { AgentEvent } from "@/features/agent/engine/types"


const field = (o: unknown, k: string): unknown =>
  o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined


const asStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined)


/** Map an engine tool name to the UI ToolName the chat renderers switch on. */
const toToolName = (name: string): ToolName => {
  if (name === "create_note") return "create_note"
  if (name === "update_note") return "edit_note"
  if (name === "link_notes") return "link_notes"
  return "raw_message"
}


/** Build the UI ToolOutput a tool-step renders, from the engine's args + result. */
const toOutput = (name: string, args: unknown, result: unknown, boardId: string): ToolOutput => {
  const id = asStr(field(result, "id")) ?? ""
  if (name === "create_note") {
    return { type: "create_note", noteId: id, graphUid: boardId, label: asStr(field(args, "title")) ?? null, noteType: "note" }
  }
  if (name === "update_note") {
    return { type: "edit_note", noteId: id, graphUid: boardId, label: asStr(field(args, "title")) ?? null, noteType: "note" }
  }
  if (name === "link_notes") {
    return {
      type: "link_notes",
      linkId: id,
      sourceId: asStr(field(args, "sourceId")) ?? "",
      targetId: asStr(field(args, "targetId")) ?? "",
      graphUid: boardId,
      label: asStr(field(args, "label")) ?? null,
    }
  }
  return JSON.stringify(result)
}


/**
 * Accumulate the engine's `AgentEvent` stream into the `ReasoningStep[]` the
 * existing chat UI renders. Pure — re-run over the full event list on each new
 * event (cheap; fresh objects drive React re-renders).
 */
export const stepsFromEvents = (events: AgentEvent[], boardId: string): ReasoningStep[] => {
  const steps: ReasoningStep[] = []
  const openByTool = new Map<string, ToolCallStep>()
  let seq = 0
  for (const ev of events) {
    if (ev.type === "tool_start") {
      const step: ToolCallStep = {
        type: "tool_call",
        id: `tool-${seq++}`,
        name: toToolName(ev.toolName),
        thought: "",
        output: "",
        state: "started",
        eventMessages: [],
        arguments: { input: ev.args },
      }
      steps.push(step)
      openByTool.set(ev.toolName, step)
    } else if (ev.type === "tool_result") {
      const open = openByTool.get(ev.toolName)
      if (open) {
        open.output = toOutput(ev.toolName, open.arguments?.input, ev.result, boardId)
        open.state = "completed"
        openByTool.delete(ev.toolName)
      }
    } else if (ev.type === "assistant_text") {
      steps.push({ type: "reasoning_step", id: `text-${seq++}`, reasoning: "", message: ev.text })
    }
  }
  return steps
}


/** The latest assistant text across the event stream (the answer body), if any. */
export const latestAssistantText = (events: AgentEvent[]): string => {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i]!
    if (ev.type === "assistant_text") return ev.text
  }
  return ""
}
