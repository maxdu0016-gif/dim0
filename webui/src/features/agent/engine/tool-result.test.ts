import { describe, expect, it } from "vitest"
import { isToolFailure, toolThrew, unknownTool, userDeclined } from "./tool-result"


describe("tool-result contract", () => {
  it("userDeclined names the tool, frames it as a permission choice, and says don't retry", () => {
    const r = userDeclined("web_search")
    expect(r).toMatchObject({ ok: false, error: "user_declined", tool: "web_search" })
    expect(r.message).toContain("web_search")
    expect(r.message.toLowerCase()).toContain("declined")
    expect(r.message.toLowerCase()).toContain("do not call")
  })

  it("unknownTool names the missing tool and steers back to valid ones", () => {
    const r = unknownTool("frobnicate")
    expect(r).toMatchObject({ ok: false, error: "unknown_tool", tool: "frobnicate" })
    expect(r.message).toContain("frobnicate")
    expect(r.message).toContain("no tool named")
  })

  it("toolThrew carries the tool name and the underlying error message", () => {
    const r = toolThrew("code_interpreter", new Error("segfault"))
    expect(r).toMatchObject({ ok: false, error: "tool_error", tool: "code_interpreter" })
    expect(r.message).toContain("code_interpreter")
    expect(r.message).toContain("segfault")
  })

  it("toolThrew stringifies a non-Error throw", () => {
    expect(toolThrew("fetch", "raw string").message).toContain("raw string")
  })

  it("isToolFailure discriminates failures from a tool's own output", () => {
    expect(isToolFailure(userDeclined("x"))).toBe(true)
    expect(isToolFailure({ id: "n1", created: true })).toBe(false) // a tool's success output
    expect(isToolFailure({ error: "note not found" })).toBe(false) // a tool's soft error (no `ok`)
    expect(isToolFailure(null)).toBe(false)
    expect(isToolFailure("declined")).toBe(false)
  })
})
