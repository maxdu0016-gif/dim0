// Tests for the document-citation (`#doc-<id>`) branch of MarkdownLink.
//
// Vanilla react-dom + act (repo convention). useNavigate is mocked — the doc
// branch doesn't route, but MarkdownLink calls the hook unconditionally.

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => () => {} }))

import { MarkdownLink } from "./markdown-link"


describe("MarkdownLink — #doc- citation", () => {
  let container: HTMLDivElement
  let root: Root


  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    // jsdom doesn't implement scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn()
  })


  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.querySelectorAll("details").forEach((d) => d.remove())
  })


  it("renders the title text as an anchor (not the bare link icon)", () => {
    act(() => root.render(<MarkdownLink href="#doc-abc">Report.pdf</MarkdownLink>))
    const a = container.querySelector("a")
    expect(a?.getAttribute("href")).toBe("#doc-abc")
    expect(a?.textContent).toBe("Report.pdf") // label kept, not replaced by an icon
  })


  it("opens the target <details> and scrolls to it on click", () => {
    const details = document.createElement("details")
    details.id = "doc-abc"
    document.body.appendChild(details)
    expect(details.open).toBe(false)

    act(() => root.render(<MarkdownLink href="#doc-abc">Report.pdf</MarkdownLink>))
    act(() => container.querySelector("a")?.click())

    expect(details.open).toBe(true)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})
