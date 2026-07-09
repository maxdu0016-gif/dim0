import { afterEach, describe, expect, it, vi } from "vitest"


// The managed factories' DEFAULT transports route through the shared api layer.
// Mock it so we can assert the per-run X-Run-Id header is attached (metering).
vi.mock("@/api", () => ({
  apiFetch: vi.fn(),
  fetchWithAuthRaw: vi.fn(),
}))
vi.mock("@/config/api", () => ({ API_URL: "https://api.test" }))
vi.mock("../utils/stream/digest", () => ({ handleStreamingResponse: vi.fn() }))

import { apiFetch, fetchWithAuthRaw } from "@/api"
import { handleStreamingResponse } from "../utils/stream/digest"
import { managedLlmClient } from "./managed-client"
import { managedSearchClient } from "./web-search"
import { managedCodeClient } from "./code-interpreter"
import { managedFetchClient } from "./fetch-url"
import type { LlmMessage } from "./types"


const apiFetchMock = vi.mocked(apiFetch)
const rawMock = vi.mocked(fetchWithAuthRaw)
const streamMock = vi.mocked(handleStreamingResponse)


// Header value passed to the last apiFetch call, whatever HeadersInit shape it took.
const lastRunIdHeader = (): string | undefined => {
  const opts = apiFetchMock.mock.calls.at(-1)?.[0] as { headers?: Record<string, string> } | undefined
  return opts?.headers?.["X-Run-Id"]
}


afterEach(() => {
  vi.clearAllMocks()
})


describe("managed default transports attach X-Run-Id", () => {
  it("LLM /ai/llm sends the run id", async () => {
    apiFetchMock.mockResolvedValue({ data: { choices: [{ message: { role: "assistant", content: "ok" } }] } })
    const messages: LlmMessage[] = [{ role: "user", content: "hi" }]
    await managedLlmClient("auto", { runId: "run-42" }).complete(messages, [])
    expect(lastRunIdHeader()).toBe("run-42")
  })

  it("search /ai/search sends the run id", async () => {
    apiFetchMock.mockResolvedValue({ data: { answer: "", results: [] } })
    await managedSearchClient({ runId: "run-42" }).search("cats")
    expect(lastRunIdHeader()).toBe("run-42")
  })

  it("code /ai/code sends the run id", async () => {
    apiFetchMock.mockResolvedValue({ data: { status: "success", stdout: "", stderr: "", duration_ms: 1 } })
    await managedCodeClient({ runId: "run-42" }).run("1+1", "python")
    expect(lastRunIdHeader()).toBe("run-42")
  })

  it("fetch /ai/fetch sends the run id", async () => {
    apiFetchMock.mockResolvedValue({ data: { url: "https://a.com", title: null, text: "" } })
    await managedFetchClient({ runId: "run-42" }).fetch("https://a.com")
    expect(lastRunIdHeader()).toBe("run-42")
  })

  it("omits the header entirely when no run id is given", async () => {
    apiFetchMock.mockResolvedValue({ data: { answer: "", results: [] } })
    await managedSearchClient({}).search("q")
    const opts = apiFetchMock.mock.calls.at(-1)?.[0] as { headers?: Record<string, string> }
    expect(opts.headers).toEqual({})
  })

  it("streaming /ai/llm/stream sets the run id header", async () => {
    rawMock.mockResolvedValue({ ok: true } as Response)
    streamMock.mockReturnValue((async function* () {
      yield { type: "final", message: { role: "assistant", content: "done" } }
    })() as ReturnType<typeof handleStreamingResponse>)

    const messages: LlmMessage[] = [{ role: "user", content: "hi" }]
    const it = managedLlmClient("auto", { runId: "run-99" }).completeStream!(messages, [])
    // drain the stream so the transport actually runs
    for await (const _ev of it) void _ev

    const init = rawMock.mock.calls.at(-1)?.[1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get("X-Run-Id")).toBe("run-99")
    expect(headers.get("Content-Type")).toBe("application/json")
  })
})
