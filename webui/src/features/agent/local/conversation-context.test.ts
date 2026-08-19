import { beforeEach, describe, expect, it } from "vitest"
import { resetIdb } from "@/test/canvas"
import { ScriptedLlm } from "@/test/llm"
import { getLocalStores } from "@/features/local-stores"
import type { ChatMessage } from "@/features/agent/types/chat"
import {
  CONV_CTX_TURNS,
  estimateTokens,
  maybeRefreshConversationContext,
  shouldRefreshConversation,
} from "./conversation-context"


const msg = (role: "user" | "assistant", text: string): ChatMessage => ({
  id: `${role}-${Math.random()}`,
  role,
  content: { markdown: text },
  chatUid: "c1",
  properties: {},
})


beforeEach(() => resetIdb())


describe("estimateTokens", () => {
  it("approximates ~4 chars per token", () => {
    expect(estimateTokens("12345678")).toBe(2)
    expect(estimateTokens("")).toBe(0)
  })
})


describe("shouldRefreshConversation", () => {
  it("fires when the turn count grows past the floor", () => {
    expect(shouldRefreshConversation({ contextTurnAt: 0 }, CONV_CTX_TURNS, 0)).toBe(true)
  })

  it("fires on token growth even under the turn floor", () => {
    expect(shouldRefreshConversation({ contextTurnAt: 0, contextTokenAt: 0 }, 1, 5000)).toBe(true)
  })

  it("does not fire when both are under their thresholds", () => {
    expect(shouldRefreshConversation({ contextTurnAt: 1, contextTokenAt: 100 }, 2, 200)).toBe(false)
  })
})


describe("maybeRefreshConversationContext", () => {
  const seedChat = async (chatUid: string, messages: ChatMessage[]) => {
    const { chats } = await getLocalStores()
    await chats.saveTranscript(chatUid, "board-1", messages)
  }

  const contextOf = async (chatUid: string): Promise<string | undefined> => {
    const { chats } = await getLocalStores()
    return (await chats.getChat(chatUid))?.context
  }

  const manyTurns = (): ChatMessage[] =>
    Array.from({ length: CONV_CTX_TURNS + 1 }, (_, i) => msg(i % 2 === 0 ? "user" : "assistant", `turn ${i}`))


  it("writes a rolling summary once the thread has grown enough", async () => {
    await seedChat("c1", manyTurns())
    const llm = new ScriptedLlm([{ kind: "text", text: "User is planning a trip; itinerary drafted." }])
    await maybeRefreshConversationContext("c1", manyTurns(), llm)
    expect(await contextOf("c1")).toBe("User is planning a trip; itinerary drafted.")
  })


  it("does not summarize a short thread under the gate", async () => {
    await seedChat("c1", [msg("user", "hi"), msg("assistant", "hello")])
    const llm = new ScriptedLlm([{ kind: "text", text: "should not be written" }])
    await maybeRefreshConversationContext("c1", [msg("user", "hi"), msg("assistant", "hello")], llm)
    expect(await contextOf("c1")).toBeUndefined()
  })


  it("no-ops with a null client (keeps the last-good context)", async () => {
    await seedChat("c1", manyTurns())
    await maybeRefreshConversationContext("c1", manyTurns(), null)
    expect(await contextOf("c1")).toBeUndefined()
  })
})
