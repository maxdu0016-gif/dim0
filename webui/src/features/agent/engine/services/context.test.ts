import { describe, expect, it } from "vitest"
import type { ByokConfig } from "../byok-client"
import { agentResolveContext } from "./context"
import { resolveAllServices } from "./resolve"


const cfg: ByokConfig = { provider: "openrouter", apiKey: "sk-x", model: "openai/gpt-5.4" }


describe("agentResolveContext", () => {
  it("signed in → preferManaged true (our keys first)", () => {
    const ctx = agentResolveContext({ signedIn: true, byok: cfg })
    expect(ctx.signedIn).toBe(true)
    expect(ctx.preferManaged).toBe(true)
    expect(ctx.byok.llm).toEqual({ provider: "openrouter", apiKey: "sk-x", model: "openai/gpt-5.4" })
  })

  it("signed out → preferManaged false (fall back to the key)", () => {
    const ctx = agentResolveContext({ signedIn: false, byok: cfg })
    expect(ctx.preferManaged).toBe(false)
  })

  it("no key → empty byok map", () => {
    expect(agentResolveContext({ signedIn: true }).byok).toEqual({})
    expect(agentResolveContext({ signedIn: false, byok: null }).byok).toEqual({})
  })
})


// The panel and the submit loop share this context, so assert the whole matrix
// end-to-end (context → resolveAllServices) matches the "our keys first" policy.
describe("resolveAllServices via agentResolveContext", () => {
  it("signed in + saved key → managed for every service", () => {
    const r = resolveAllServices(agentResolveContext({ signedIn: true, byok: cfg }))
    expect(r.llm.mode).toBe("managed")
    expect(r.search.mode).toBe("managed")
    expect(r.code.mode).toBe("managed")
    expect(r.fetch.mode).toBe("managed")
  })

  it("signed out + saved key → BYOK for llm, off for the managed-only services", () => {
    const r = resolveAllServices(agentResolveContext({ signedIn: false, byok: cfg }))
    expect(r.llm.mode).toBe("byok")
    expect(r.search.mode).toBe("off")
    expect(r.code.mode).toBe("off")
    expect(r.fetch.mode).toBe("off")
  })

  it("signed out, no key → everything off", () => {
    const r = resolveAllServices(agentResolveContext({ signedIn: false }))
    expect(r.llm.mode).toBe("off")
    expect(r.search.mode).toBe("off")
  })
})
