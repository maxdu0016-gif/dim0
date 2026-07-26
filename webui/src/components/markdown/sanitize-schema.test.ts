import { describe, expect, it } from "vitest"
import { fromHtml } from "hast-util-from-html"
import { toHtml } from "hast-util-to-html"
import { sanitize } from "hast-util-sanitize"
import { SANITIZE_SCHEMA } from "./sanitize-schema"


// Exercise the schema the way rehype-sanitize applies it (see markdown-view.tsx):
// parse raw HTML → sanitize with SANITIZE_SCHEMA → serialize.
const clean = (html: string): string => toHtml(sanitize(fromHtml(html, { fragment: true }), SANITIZE_SCHEMA))


describe("SANITIZE_SCHEMA — strips XSS vectors", () => {
  it("removes <script>", () => {
    expect(clean("<script>alert(1)</script>")).not.toContain("<script")
  })

  it("removes <iframe> (incl. javascript: src)", () => {
    const out = clean('<iframe src="javascript:alert(1)"></iframe>')
    expect(out).not.toContain("<iframe")
    expect(out).not.toContain("javascript:")
  })

  it("removes <object>/<embed>/<form>", () => {
    const out = clean("<object></object><embed><form></form>")
    expect(out).not.toContain("<object")
    expect(out).not.toContain("<embed")
    expect(out).not.toContain("<form")
  })

  it("strips inline event handlers but can keep the element", () => {
    const out = clean('<img src="x" onerror="alert(1)">')
    expect(out).not.toContain("onerror")
    expect(out).not.toContain("alert(1)")
  })

  it("strips a javascript: href on an anchor (keeps the text)", () => {
    const out = clean('<a href="javascript:alert(1)">click</a>')
    expect(out).not.toContain("javascript:")
    expect(out).toContain("click")
  })

  it("strips a data: URI on an image", () => {
    expect(clean('<img src="data:text/html,<script>alert(1)</script>">')).not.toContain("data:")
  })
})


describe("SANITIZE_SCHEMA — preserves the viewer's intended rich output", () => {
  it("keeps highlight <mark> with its data-color", () => {
    const out = clean('<mark data-color="blue">key</mark>')
    expect(out).toContain("<mark")
    expect(out).toContain("data-color")
    expect(out).toContain("key")
  })

  it("keeps <details>/<summary> toggles", () => {
    const out = clean("<details><summary>more</summary>body</details>")
    expect(out).toContain("<details")
    expect(out).toContain("<summary")
  })

  it("keeps KaTeX MathML output (<math> subtree)", () => {
    const out = clean("<math><semantics><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></semantics></math>")
    expect(out).toContain("<math")
    expect(out).toContain("<mi")
  })

  it("keeps KaTeX HTML spans with class + inline layout style", () => {
    const out = clean('<span class="katex" style="height:0.8em" aria-hidden="true">x</span>')
    expect(out).toContain("<span")
    expect(out).toContain('class="katex"')
    expect(out).toContain("height:0.8em")
  })

  it("keeps ordinary links + images on safe schemes", () => {
    expect(clean('<a href="https://example.com/">x</a>')).toContain("https://example.com/")
    expect(clean('<img src="https://example.com/a.png">')).toContain("https://example.com/a.png")
  })
})
