import { afterEach, describe, expect, it, vi } from "vitest"


// The default transports for search/code go through the shared api layer. Mock
// it so we can drive the "over quota → retry with the user's key" fallback.
vi.mock("@/api", () => ({ apiFetch: vi.fn() }))

import { apiFetch } from "@/api"
import { managedSearchClient } from "./web-search"
import { managedCodeClient } from "./code-interpreter"


const apiFetchMock = vi.mocked(apiFetch)


const headersOf = (callIndex: number): Record<string, string> => {
  const opts = apiFetchMock.mock.calls[callIndex]?.[0] as { headers?: Record<string, string> }
  return opts?.headers ?? {}
}


afterEach(() => vi.clearAllMocks())


describe("search BYOK fallback on 429", () => {
  it("retries with X-Provider-Key when the managed call is over quota", async () => {
    apiFetchMock
      .mockRejectedValueOnce(new Error("429 Too Many Requests - over quota"))
      .mockResolvedValueOnce({ data: { answer: "", results: [{ url: "https://a.com", title: "A", content: "b" }] } })

    const results = await managedSearchClient({ runId: "r1", engine: "exa", byokKey: "exa-user" }).search("cats")

    expect(apiFetchMock).toHaveBeenCalledTimes(2)
    expect(headersOf(0)["X-Provider-Key"]).toBeUndefined() // 1st call: our keys
    expect(headersOf(1)["X-Provider-Key"]).toBe("exa-user") // retry: user's key
    expect(results[0].url).toBe("https://a.com")
  })

  it("does not retry (and rethrows) when there's no BYOK key", async () => {
    apiFetchMock.mockRejectedValueOnce(new Error("429 Too Many Requests"))
    await expect(managedSearchClient({ runId: "r1" }).search("cats")).rejects.toThrow("429")
    expect(apiFetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not retry on a non-429 error", async () => {
    apiFetchMock.mockRejectedValueOnce(new Error("500 Internal Server Error"))
    await expect(managedSearchClient({ byokKey: "exa-user" }).search("cats")).rejects.toThrow("500")
    expect(apiFetchMock).toHaveBeenCalledTimes(1)
  })
})


describe("code BYOK fallback on 429", () => {
  it("retries the run with X-Provider-Key when over quota", async () => {
    apiFetchMock
      .mockRejectedValueOnce(new Error("429 Too Many Requests"))
      .mockResolvedValueOnce({ data: { status: "success", stdout: "ok", stderr: "", duration_ms: 3 } })

    const r = await managedCodeClient({ runId: "r1", byokKey: "dtn-user" }).run("print(1)", "python")

    expect(apiFetchMock).toHaveBeenCalledTimes(2)
    expect(headersOf(1)["X-Provider-Key"]).toBe("dtn-user")
    expect(r.ok).toBe(true)
  })
})
