import { describe, expect, it } from "vitest"
import { buildWidgetDocument } from "./widget-document"


// The security intent (FE-F5): every widget document ships a CSP so a widget
// authored by the agent or a collab peer can't exfiltrate (connect-src 'none')
// or load remote code from non-allowlisted origins.

describe("buildWidgetDocument — ships a CSP", () => {
  it("injects the CSP <meta> into a full document's <head>", () => {
    const out = buildWidgetDocument("<!doctype html><html><head></head><body>hi</body></html>")
    expect(out).toContain('http-equiv="Content-Security-Policy"')
    // inside <head>, before </head>
    expect(out.indexOf("Content-Security-Policy")).toBeGreaterThan(out.indexOf("<head"))
    expect(out.indexOf("Content-Security-Policy")).toBeLessThan(out.indexOf("</head>"))
  })

  it("injects the CSP <meta> into a body-only widget's constructed document", () => {
    const out = buildWidgetDocument("<div>hi</div>")
    expect(out).toContain('http-equiv="Content-Security-Policy"')
  })

  it("blocks network egress and form/base/frame sinks", () => {
    const out = buildWidgetDocument("<div>hi</div>")
    expect(out).toContain("connect-src 'none'")
    expect(out).toContain("form-action 'none'")
    expect(out).toContain("base-uri 'none'")
    expect(out).toContain("default-src 'none'")
  })

  it("still allows inline scripts/styles + the documented CDN allowlist (self-contained widgets render)", () => {
    const out = buildWidgetDocument("<div>hi</div>")
    expect(out).toMatch(/script-src 'unsafe-inline'[^;]*cdn\.jsdelivr\.net/)
    expect(out).toContain("https://fonts.googleapis.com")
  })

  it("governs a widget that hoists a remote <script> — CSP present to constrain its origin", () => {
    // The tag survives the build (CSP enforces at load time), but the policy
    // that denies non-allowlisted origins + network egress is now in the doc.
    const out = buildWidgetDocument('<div><script src="https://evil.example/w.js"></script></div>')
    expect(out).toContain("Content-Security-Policy")
    expect(out).toContain("connect-src 'none'")
  })
})
