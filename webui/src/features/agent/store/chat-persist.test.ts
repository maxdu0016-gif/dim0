import { beforeEach, describe, expect, it } from "vitest"
import type { ChatMessage } from "@/features/agent/types/chat"
import { resetIdb } from "@/test/canvas"
import { listLocalChats, loadMessages, saveMessages } from "./chat-persist"


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


  it("lists a board's chats and isolates them by board", async () => {
    await saveMessages("c1", "b1", [msg("m1", "hi")], "First chat")
    await saveMessages("c2", "b1", [msg("m1", "yo", "c2")], "Second chat")
    await saveMessages("c3", "b2", [msg("m1", "elsewhere", "c3")], "Other board")

    const b1 = await listLocalChats("b1")
    expect(b1.map((c) => c.id).sort()).toEqual(["c1", "c2"])
    expect(b1.find((c) => c.id === "c1")?.label).toBe("First chat")

    const b2 = await listLocalChats("b2")
    expect(b2.map((c) => c.id)).toEqual(["c3"])
  })


  it("preserves a chat's label when a later save omits it", async () => {
    await saveMessages("c1", "b1", [msg("m1", "a")], "Labeled")
    await saveMessages("c1", "b1", [msg("m1", "a"), msg("m2", "b")]) // no label

    const [chat] = await listLocalChats("b1")
    expect(chat.label).toBe("Labeled")
  })
})
