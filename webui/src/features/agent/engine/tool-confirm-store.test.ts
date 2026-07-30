import { beforeEach, describe, expect, it } from "vitest"
import { useToolConfirm } from "./tool-confirm-store"


beforeEach(() => useToolConfirm.setState({ pending: null }))


describe("useToolConfirm", () => {
  it("parks a request as pending and resolves the decision on allow-once", async () => {
    const p = useToolConfirm.getState().request({ name: "fetch", args: { url: "x" } })
    expect(useToolConfirm.getState().pending?.name).toBe("fetch")
    useToolConfirm.getState().resolve("once")
    expect(await p).toBe("once")
    expect(useToolConfirm.getState().pending).toBeNull()
  })

  it("carries the 'always' decision through", async () => {
    const p = useToolConfirm.getState().request({ name: "web_search", args: {} })
    useToolConfirm.getState().resolve("always")
    expect(await p).toBe("always")
  })

  it("resolves 'deny' on decline", async () => {
    const p = useToolConfirm.getState().request({ name: "fetch", args: {} })
    useToolConfirm.getState().resolve("deny")
    expect(await p).toBe("deny")
  })

  it("auto-denies a second request while one is pending (no clobber of the first)", async () => {
    const first = useToolConfirm.getState().request({ name: "fetch", args: { url: "a" } })
    const second = useToolConfirm.getState().request({ name: "code_interpreter", args: {} })
    expect(await second).toBe("deny") // new request fails closed
    expect(useToolConfirm.getState().pending?.name).toBe("fetch") // first prompt untouched
    useToolConfirm.getState().resolve("once")
    expect(await first).toBe("once")
  })

  it("resolve() is a no-op when nothing is pending", () => {
    expect(() => useToolConfirm.getState().resolve("once")).not.toThrow()
  })
})
