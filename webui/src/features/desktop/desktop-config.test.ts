import { afterEach, describe, expect, it } from "vitest"
import { DESKTOP_API_BASE_KEY } from "@/config/api"
import { getDesktopApiBase, normalizeApiBase } from "./desktop-config"


afterEach(() => localStorage.clear())


describe("normalizeApiBase", () => {
  it("adds https:// when no scheme is given", () => {
    expect(normalizeApiBase("api.dim0.net")).toBe("https://api.dim0.net")
  })

  it("keeps an explicit scheme and strips any path / trailing slash", () => {
    expect(normalizeApiBase("http://localhost:8888/")).toBe("http://localhost:8888")
    expect(normalizeApiBase("https://api.dim0.net/base/")).toBe("https://api.dim0.net")
  })

  it("trims surrounding whitespace", () => {
    expect(normalizeApiBase("  https://api.dim0.net  ")).toBe("https://api.dim0.net")
  })

  it("throws on empty or malformed input", () => {
    expect(() => normalizeApiBase("   ")).toThrow()
    expect(() => normalizeApiBase("http://")).toThrow()
  })
})


describe("getDesktopApiBase", () => {
  it("returns undefined when unset, and the stored value when set", () => {
    expect(getDesktopApiBase()).toBeUndefined()
    localStorage.setItem(DESKTOP_API_BASE_KEY, "https://api.dim0.net")
    expect(getDesktopApiBase()).toBe("https://api.dim0.net")
  })
})
