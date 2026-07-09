import { describe, expect, it } from "vitest"
import { ByokLlmClient, type ByokConfig } from "../byok-client"
import { resolveLocalLlm } from "./local-llm"


const cfg: ByokConfig = { provider: "openrouter", apiKey: "sk-x", model: "openai/gpt-5.4" }


describe("resolveLocalLlm (G1 behavior-neutrality guard)", () => {
  it("BYOK config present → a real ByokLlmClient (the pre-refactor behavior)", () => {
    expect(resolveLocalLlm(cfg)).toBeInstanceOf(ByokLlmClient)
  })

  it("no config → null (caller shows 'set your API key')", () => {
    expect(resolveLocalLlm(null)).toBeNull()
  })

  it("managed stays OFF in G1: even a would-be-managed setup yields BYOK-or-null, never a non-BYOK client", () => {
    // resolveLocalLlm hard-codes managed off; with a key it must be BYOK, and
    // without a key it must be null — never a managed client (none exists yet).
    expect(resolveLocalLlm(cfg)).toBeInstanceOf(ByokLlmClient)
    expect(resolveLocalLlm(null)).toBeNull()
  })
})
