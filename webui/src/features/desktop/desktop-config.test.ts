import { afterEach, describe, expect, it, vi } from "vitest"
import { getEffectiveApiBase } from "./desktop-config"


afterEach(() => {
  vi.unstubAllEnvs()
})


describe("getEffectiveApiBase", () => {
  it("returns undefined when VITE_API_URL is unset", () => {
    vi.stubEnv("VITE_API_URL", "")
    expect(getEffectiveApiBase()).toBeUndefined()
  })

  it("returns the baked origin when set", () => {
    vi.stubEnv("VITE_API_URL", "https://vendor.example")
    expect(getEffectiveApiBase()).toBe("https://vendor.example")
  })

  it("normalizes to a bare origin (drops a path + trailing slash)", () => {
    vi.stubEnv("VITE_API_URL", "https://vendor.example/api/")
    expect(getEffectiveApiBase()).toBe("https://vendor.example")
  })

  it("tolerates a missing scheme — defaults to https, not origin 'null'", () => {
    vi.stubEnv("VITE_API_URL", "vendor.example")
    expect(getEffectiveApiBase()).toBe("https://vendor.example")
  })

  it("trims surrounding whitespace", () => {
    vi.stubEnv("VITE_API_URL", "  https://vendor.example  ")
    expect(getEffectiveApiBase()).toBe("https://vendor.example")
  })
})
