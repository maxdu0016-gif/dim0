import { describe, expect, it, vi } from "vitest"
import type { ChatCompletion } from "openai/resources/chat/completions"
import type { LlmMessage } from "./types"
import { managedLlmClient, type LlmTurnPost } from "./managed-client"



const completion = (message: ChatCompletion["choices"][number]["message"]): { choices: ChatCompletion["choices"] } => ({
  choices: [{ index: 0, finish_reason: "stop", logprobs: null, message }],
})


const messages: LlmMessage[] = [
  { role: "system", content: "sys" },
  { role: "user", content: "make a note" },
]


describe("managedLlmClient", () => {
  it("posts the model + OpenAI-mapped messages to the proxy", async () => {
    const post = vi.fn<LlmTurnPost>(async () =>
      completion({ role: "assistant", content: "ok", refusal: null }),
    )
    const llm = managedLlmClient("auto", post)
    await llm.complete(messages, [])

    const body = post.mock.calls[0][0]
    expect(body.model).toBe("auto")
    // messages were mapped to OpenAI shape (system + user roles preserved)
    expect(Array.isArray(body.messages)).toBe(true)
    expect((body.messages as { role: string }[]).map((m) => m.role)).toEqual(["system", "user"])
  })

  it("maps a text response to an LlmTurn text", async () => {
    const post = vi.fn<LlmTurnPost>(async () =>
      completion({ role: "assistant", content: "the answer", refusal: null }),
    )
    const turn = await managedLlmClient("auto", post).complete(messages, [])
    expect(turn).toEqual({ kind: "text", text: "the answer" })
  })

  it("maps a tool-call response to an LlmTurn tool_calls", async () => {
    const post = vi.fn<LlmTurnPost>(async () =>
      completion({
        role: "assistant",
        content: null,
        refusal: null,
        tool_calls: [
          { id: "c1", type: "function", function: { name: "create_note", arguments: '{"t":1}' } },
        ],
      }),
    )
    const turn = await managedLlmClient("claude-opus-4.8", post).complete(messages, [
      { name: "create_note", description: "d", parameters: { type: "object" } },
    ])
    expect(turn.kind).toBe("tool_calls")
    if (turn.kind === "tool_calls") {
      expect(turn.calls).toEqual([{ id: "c1", name: "create_note", arguments: '{"t":1}' }])
    }
  })

  it("forwards tool defs (OpenAI-shaped) to the proxy", async () => {
    const post = vi.fn<LlmTurnPost>(async () =>
      completion({ role: "assistant", content: "x", refusal: null }),
    )
    await managedLlmClient("auto", post).complete(messages, [
      { name: "f", description: "d", parameters: { type: "object" } },
    ])
    const body = post.mock.calls[0][0]
    expect((body.tools as { function: { name: string } }[])[0].function.name).toBe("f")
  })
})
