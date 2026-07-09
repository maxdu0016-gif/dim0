import { describe, expect, it } from "vitest"
import type { ChatCompletionChunk } from "openai/resources/chat/completions"
import type { LlmStreamEvent } from "./types"
import { assembleStreamedTurn } from "./stream-assemble"


async function* chunksOf(...cs: unknown[]): AsyncGenerator<ChatCompletionChunk> {
  for (const c of cs) yield c as ChatCompletionChunk
}

const textChunk = (content: string) => ({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })
const toolChunk = (index: number, id: string | undefined, name: string | undefined, args: string) => ({
  choices: [{ index: 0, finish_reason: null, delta: { tool_calls: [{ index, id, type: "function", function: { name, arguments: args } }] } }],
})

const collect = async (chunks: AsyncIterable<ChatCompletionChunk>): Promise<LlmStreamEvent[]> => {
  const out: LlmStreamEvent[] = []
  for await (const ev of assembleStreamedTurn(chunks)) out.push(ev)
  return out
}


describe("assembleStreamedTurn", () => {
  it("emits text deltas then a final text turn", async () => {
    const events = await collect(chunksOf(textChunk("Hel"), textChunk("lo")))
    expect(events).toEqual([
      { kind: "delta", text: "Hel" },
      { kind: "delta", text: "lo" },
      { kind: "final", turn: { kind: "text", text: "Hello" } },
    ])
  })

  it("stitches tool-call fragments (id/name once, arguments across chunks) by index", async () => {
    const events = await collect(chunksOf(
      toolChunk(0, "c1", "create_note", '{"ti'),
      toolChunk(0, undefined, undefined, 'tle":"x"}'),
    ))
    expect(events).toEqual([
      { kind: "final", turn: { kind: "tool_calls", calls: [{ id: "c1", name: "create_note", arguments: '{"title":"x"}' }] } },
    ])
  })

  it("assembles two parallel tool calls at different indices", async () => {
    const events = await collect(chunksOf(
      toolChunk(0, "a", "f", "{}"),
      toolChunk(1, "b", "g", "{}"),
    ))
    const final = events.at(-1)
    expect(final?.kind).toBe("final")
    if (final?.kind === "final" && final.turn.kind === "tool_calls") {
      expect(final.turn.calls.map((c) => c.id)).toEqual(["a", "b"])
    }
  })

  it("ignores chunks with no choices/delta", async () => {
    const events = await collect(chunksOf({ choices: [] }, textChunk("hi")))
    expect(events).toEqual([
      { kind: "delta", text: "hi" },
      { kind: "final", turn: { kind: "text", text: "hi" } },
    ])
  })
})
