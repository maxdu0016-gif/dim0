// Tests for the unified ServicesPanel. Mirrors the repo harness (no RTL): mount
// with vanilla react-dom under `act`, mocking auth + the BYOK store via hoisted
// mutable state. We assert the per-service source pills, the gated CTAs, and
// when the BYOK key form is shown — across the (signedIn × savedKey) matrix.

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"


const s = vi.hoisted(() => ({
  signedIn: false,
  configured: false,
  provider: "openrouter" as "openrouter" | "openai",
  apiKey: "",
  model: "",
  remember: false,
}))


vi.mock("@/lib/auth", () => ({ useIsSignedIn: () => s.signedIn }))
vi.mock("@/features/agent/byok/byok-store", () => {
  const state = {
    get provider() { return s.provider },
    get apiKey() { return s.apiKey },
    get model() { return s.model },
    get remember() { return s.remember },
    get configured() { return s.configured },
    asConfig: () => (s.apiKey ? { provider: s.provider, apiKey: s.apiKey, model: s.model || "openai/gpt-5.4" } : null),
    setConfig: () => {},
    clear: () => {},
  }
  return { useByokStore: (sel?: (st: typeof state) => unknown) => (sel ? sel(state) : state) }
})


import { ServicesPanel } from "./services-panel"


let container: HTMLElement
let root: Root


const render = (): void => {
  act(() => {
    root = createRoot(container)
    root.render(<ServicesPanel />)
  })
}

const text = (): string => container.textContent ?? ""
const signinLinks = (): number => container.querySelectorAll('a[href="/signin"]').length
const hasKeyForm = (): boolean => !!container.querySelector('input[type="password"]')
const occurrences = (needle: string): number => text().split(needle).length - 1


describe("ServicesPanel", () => {
  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    s.signedIn = false
    s.configured = false
    s.provider = "openrouter"
    s.apiKey = ""
    s.model = ""
    s.remember = false
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("signed out, no key: models needs a key, managed-only services are gated", () => {
    render()
    expect(text()).toContain("on-device · your key")
    expect(text()).toContain("Set a key below")           // models row (llm off)
    // search + code + fetch are gated, each with a Sign in CTA
    expect(occurrences("Needs an account")).toBe(3)
    expect(signinLinks()).toBe(3)
    expect(hasKeyForm()).toBe(true)                        // BYOK form shown signed-out
    expect(text()).not.toContain("Our keys")
  })

  it("signed out, key saved: models = Your key, others still gated", () => {
    s.configured = true
    s.apiKey = "sk-or-abc"
    render()
    expect(text()).toContain("Your key")                  // models resolves to byok
    expect(occurrences("Needs an account")).toBe(3)
    expect(hasKeyForm()).toBe(true)
    expect(text()).not.toContain("Our keys")
  })

  it("signed in: every service uses our keys, no BYOK form, no gating", () => {
    s.signedIn = true
    render()
    expect(text()).toContain("our keys first")
    expect(text()).toContain("Our keys · auto")           // models
    // search + code + fetch each show plain "Our keys" → 3 more, plus the llm one
    expect(occurrences("Our keys")).toBe(4)
    expect(signinLinks()).toBe(0)
    expect(text()).not.toContain("Needs an account")
    expect(hasKeyForm()).toBe(false)
  })

  it("signed in with a saved key still prefers our keys (key is superseded)", () => {
    s.signedIn = true
    s.configured = true
    s.apiKey = "sk-or-abc"
    render()
    expect(text()).toContain("Our keys · auto")
    expect(text()).not.toContain("Your key")
    expect(hasKeyForm()).toBe(false)
  })
})
