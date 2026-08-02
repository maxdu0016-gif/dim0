import { afterEach, describe, expect, it, vi } from "vitest"
import { isTauri } from "@/platform"
import {
  DESKTOP_API_BASE_KEY,
  getDesktopApiBase,
  getEffectiveApiBase,
  hasDesktopServer,
  isInsecureRemote,
  normalizeApiBase,
} from "./desktop-config"


// The server override is desktop-only; default the platform to Tauri so the
// localStorage-backed helpers are exercised, and flip it off per-test for the
// web-safety case.
vi.mock("@/platform", () => ({ isTauri: vi.fn(() => true) }))


afterEach(() => {
  localStorage.clear()
  vi.unstubAllEnvs()
  vi.mocked(isTauri).mockReturnValue(true)
})


describe("normalizeApiBase", () => {
  it("adds https:// for a bare domain", () => {
    expect(normalizeApiBase("api.dim0.net")).toBe("https://api.dim0.net")
  })

  it("defaults localhost / IP hosts to http (LAN self-host rarely has TLS)", () => {
    expect(normalizeApiBase("localhost:8888")).toBe("http://localhost:8888")
    expect(normalizeApiBase("192.168.1.10:8888")).toBe("http://192.168.1.10:8888")
    expect(normalizeApiBase("[::1]:8888")).toBe("http://[::1]:8888")
  })

  it("keeps an explicit scheme and drops a trailing slash", () => {
    expect(normalizeApiBase("http://localhost:8888/")).toBe("http://localhost:8888")
    expect(normalizeApiBase("https://api.dim0.net/")).toBe("https://api.dim0.net")
  })

  it("rejects a URL with a base path (the app addresses the server at root)", () => {
    expect(() => normalizeApiBase("https://host/dim0")).toThrow()
    expect(() => normalizeApiBase("https://host/dim0/")).toThrow()
  })

  it("trims surrounding whitespace", () => {
    expect(normalizeApiBase("  https://api.dim0.net  ")).toBe("https://api.dim0.net")
  })

  it("throws on empty or malformed input", () => {
    expect(() => normalizeApiBase("   ")).toThrow()
    expect(() => normalizeApiBase("http://")).toThrow()
  })
})


describe("isInsecureRemote", () => {
  it("flags plaintext http to a non-loopback host", () => {
    expect(isInsecureRemote("http://server.lan")).toBe(true)
    expect(isInsecureRemote("http://example.com")).toBe(true)
  })

  it("does not flag https, or http to localhost/loopback (incl. IPv6)", () => {
    expect(isInsecureRemote("https://example.com")).toBe(false)
    expect(isInsecureRemote("http://localhost:8888")).toBe(false)
    expect(isInsecureRemote("http://127.0.0.1:8888")).toBe(false)
    expect(isInsecureRemote("http://[::1]:8888")).toBe(false)
  })
})


describe("getDesktopApiBase", () => {
  it("returns undefined when unset, and the stored value when set (desktop)", () => {
    expect(getDesktopApiBase()).toBeUndefined()
    localStorage.setItem(DESKTOP_API_BASE_KEY, "https://api.dim0.net")
    expect(getDesktopApiBase()).toBe("https://api.dim0.net")
  })

  it("ignores a stray localStorage value on the web build (isTauri false)", () => {
    vi.mocked(isTauri).mockReturnValue(false)
    localStorage.setItem(DESKTOP_API_BASE_KEY, "https://evil.example")
    expect(getDesktopApiBase()).toBeUndefined()
  })
})


describe("hasDesktopServer / getEffectiveApiBase", () => {
  it("is false when neither a baked default nor an override is set", () => {
    vi.stubEnv("VITE_API_URL", "")
    expect(hasDesktopServer()).toBe(false)
    expect(getEffectiveApiBase()).toBeUndefined()
  })

  it("is true from a baked VITE_API_URL alone", () => {
    vi.stubEnv("VITE_API_URL", "https://vendor.example")
    expect(hasDesktopServer()).toBe(true)
    expect(getEffectiveApiBase()).toBe("https://vendor.example")
  })

  it("is true from a localStorage override alone", () => {
    vi.stubEnv("VITE_API_URL", "")
    localStorage.setItem(DESKTOP_API_BASE_KEY, "https://api.dim0.net")
    expect(hasDesktopServer()).toBe(true)
  })

  it("the override wins over the baked default", () => {
    vi.stubEnv("VITE_API_URL", "https://vendor.example")
    localStorage.setItem(DESKTOP_API_BASE_KEY, "https://override.example")
    expect(getEffectiveApiBase()).toBe("https://override.example")
  })
})
