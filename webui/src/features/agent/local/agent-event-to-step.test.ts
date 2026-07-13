import { describe, expect, it } from "vitest"
import type { AgentEvent } from "@/features/agent/engine/types"
import { ToolNameIcon } from "@/features/agent/types/stream"
import { latestAssistantText, stepsFromEvents } from "./agent-event-to-step"


describe("stepsFromEvents", () => {
  it("maps a create_note call to a completed tool step + reasoning text", () => {
    const events: AgentEvent[] = [
      { type: "tool_start", toolName: "create_note", args: { title: "A" } },
      { type: "tool_result", toolName: "create_note", result: { id: "n1" } },
      { type: "assistant_text", text: "Done." },
      { type: "done" },
    ]
    const steps = stepsFromEvents(events, "board-1")

    expect(steps).toHaveLength(2)
    const tool = steps[0]
    expect(tool.type).toBe("tool_call")
    if (tool.type === "tool_call") {
      expect(tool.name).toBe("create_note")
      expect(tool.state).toBe("completed")
      expect(tool.output).toEqual({ type: "create_note", noteId: "n1", graphUid: "board-1", label: "A", noteType: "note" })
    }
    expect(steps[1]).toMatchObject({ type: "reasoning_step", message: "Done." })
  })


  it("maps update_note → edit_note and link_notes correctly", () => {
    const events: AgentEvent[] = [
      { type: "tool_start", toolName: "update_note", args: { id: "n1", title: "B" } },
      { type: "tool_result", toolName: "update_note", result: { id: "n1" } },
      { type: "tool_start", toolName: "link_notes", args: { sourceId: "n1", targetId: "n2" } },
      { type: "tool_result", toolName: "link_notes", result: { id: "e1" } },
    ]
    const steps = stepsFromEvents(events, "b")

    const edit = steps[0]
    const link = steps[1]
    expect(edit.type === "tool_call" && edit.name).toBe("edit_note")
    if (edit.type === "tool_call") expect(edit.output).toMatchObject({ type: "edit_note", noteId: "n1", label: "B" })
    expect(link.type === "tool_call" && link.name).toBe("link_notes")
    if (link.type === "tool_call") {
      expect(link.output).toEqual({ type: "link_notes", linkId: "e1", sourceId: "n1", targetId: "n2", graphUid: "b", label: null })
    }
  })


  it("leaves an in-flight tool step in the started state", () => {
    const steps = stepsFromEvents([{ type: "tool_start", toolName: "create_note", args: {} }], "b")
    expect(steps[0]).toMatchObject({ type: "tool_call", state: "started" })
  })


  it("maps local-engine tools to icon'd UI names (no undefined-icon crash)", () => {
    // search_notes / fetch used to fall through to raw_message, which has no
    // icon in ToolNameIcon → the ProgressLine 'Element type is invalid' crash.
    const cases: [string, string][] = [
      ["search_notes", "memory_search"],
      ["web_search", "web_search"],
      ["code_interpreter", "code_interpreter"],
      ["fetch", "navigate"],
    ]
    for (const [toolName, expected] of cases) {
      const [step] = stepsFromEvents([{ type: "tool_start", toolName, args: {} }], "b")
      expect(step.type === "tool_call" && step.name).toBe(expected)
      // …and every mapped name must resolve to a real icon (else the row crashes).
      expect(ToolNameIcon[expected as keyof typeof ToolNameIcon]).toBeDefined()
    }
  })


  it("a text-like/unknown tool step is normalized to reasoning (not a tool row)", () => {
    // Unknown → raw_message, which normalizeReasoningSteps folds into a
    // reasoning_step — so it renders as text, keeping reasoning vs tool distinct.
    const steps = stepsFromEvents(
      [
        { type: "tool_start", toolName: "totally_unknown_tool", args: {} },
        { type: "tool_result", toolName: "totally_unknown_tool", result: "hmm" },
      ],
      "b",
    )
    expect(steps.some((s) => s.type === "reasoning_step")).toBe(true)
    expect(steps.some((s) => s.type === "tool_call" && s.name === "raw_message")).toBe(false)
    // the icon still exists as a safety net for any stray raw_message row
    expect(ToolNameIcon.raw_message).toBeDefined()
  })


  it("coalesces a run of cumulative streaming deltas into ONE reasoning step", () => {
    const events: AgentEvent[] = [
      { type: "assistant_text", text: "Nap" },
      { type: "assistant_text", text: "Napoleon" },
      { type: "assistant_text", text: "Napoleon was" },
      { type: "assistant_text", text: "Napoleon was both" },
    ]
    const steps = stepsFromEvents(events, "b")
    expect(steps).toHaveLength(1) // not one line per token
    expect(steps[0]).toMatchObject({ type: "reasoning_step", message: "Napoleon was both" })
  })


  it("keeps assistant_text runs separated by a tool call", () => {
    const events: AgentEvent[] = [
      { type: "assistant_text", text: "thinking" },
      { type: "assistant_text", text: "thinking hard" },
      { type: "tool_start", toolName: "write_note", args: { label: "N" } },
      { type: "tool_result", toolName: "write_note", result: { id: "n1" } },
      { type: "assistant_text", text: "done" },
      { type: "assistant_text", text: "done now" },
    ]
    const reasoning = stepsFromEvents(events, "b").filter((s) => s.type === "reasoning_step")
    expect(reasoning.map((s) => (s.type === "reasoning_step" ? s.message : ""))).toEqual(["thinking hard", "done now"])
  })


  it("latestAssistantText returns the last assistant message", () => {
    expect(
      latestAssistantText([
        { type: "assistant_text", text: "first" },
        { type: "tool_start", toolName: "create_note", args: {} },
        { type: "assistant_text", text: "second" },
      ]),
    ).toBe("second")
  })
})
