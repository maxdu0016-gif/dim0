import { beforeEach, describe, expect, it } from "vitest"
import type { ChatMessage } from "@/features/agent/types/chat"
import { resetIdb } from "@/test/canvas"
import { loadMessages, saveMessages } from "./chat-persist"


const msg = (id: string, text: string, chatUid = "c1"): ChatMessage => ({
  id,
  role: "assistant",
  content: { markdown: text },
  chatUid,
  properties: {},
})


beforeEach(() => {
  resetIdb()
})


describe("chat-persist", () => {
  it("round-trips a chat's messages", async () => {
    await saveMessages("c1", "b1", [msg("m1", "hi"), msg("m2", "there")])
    const loaded = await loadMessages("c1")
    expect(loaded.map((m) => m.content.markdown)).toEqual(["hi", "there"])
  })


  it("isolates chats and replaces a chat's transcript on save", async () => {
    await saveMessages("c1", "b1", [msg("m1", "a")])
    await saveMessages("c2", "b1", [msg("x", "other", "c2")])
    await saveMessages("c1", "b1", [msg("m1", "a"), msg("m2", "b")]) // replace c1

    expect(await loadMessages("c1")).toHaveLength(2)
    expect(await loadMessages("c2")).toHaveLength(1)
  })
})
