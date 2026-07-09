import { describe, expect, it } from "vitest"
import { ByokLlmClient, type ByokConfig } from "../byok-client"
import { resolveAgentLlm } from "./local-llm"


const cfg: ByokConfig = { provider: "openrouter", apiKey: "sk-x", model: "openai/gpt-5.4" }


describe("resolveAgentLlm", () => {
  it("BYOK config present → a client (BYOK wins by default)", () => {
    expect(resolveAgentLlm(cfg, { signedIn: false })).toBeInstanceOf(ByokLlmClient)
    expect(resolveAgentLlm(cfg, { signedIn: true })).toBeInstanceOf(ByokLlmClient)
  })

  it("signed in, no key → a managed client (our keys, no BYOK needed)", () => {
    // managed reuses ByokLlmClient (different transport), so it's non-null here —
    // the point is that G2 makes signed-in + no-key USABLE, unlike G1.
    expect(resolveAgentLlm(null, { signedIn: true })).not.toBeNull()
  })

  it("signed out, no key → null (caller shows 'set your API key')", () => {
    expect(resolveAgentLlm(null, { signedIn: false })).toBeNull()
  })
})
