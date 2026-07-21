import { describe, expect, it } from "vitest"
import { chunkMarkdown } from "./doc-chunk"


describe("chunkMarkdown", () => {
  it("returns [] for empty or whitespace-only input", () => {
    expect(chunkMarkdown("")).toEqual([])
    expect(chunkMarkdown("   \n\n  ")).toEqual([])
  })

  it("keeps a short document as a single chunk with index 0", () => {
    const out = chunkMarkdown("# Title\n\nA short paragraph.")
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ index: 0, text: "# Title\n\nA short paragraph." })
  })

  it("packs paragraphs up to maxChars across multiple sequential chunks", () => {
    const para = (n: number) => `para ${n} ` + "x".repeat(40)
    const md = [para(1), para(2), para(3), para(4)].join("\n\n")
    const out = chunkMarkdown(md, { maxChars: 100, overlap: 0 })
    expect(out.length).toBeGreaterThan(1)
    out.forEach((c, i) => expect(c.index).toBe(i))
    // Without overlap, no chunk exceeds maxChars.
    out.forEach((c) => expect(c.text.length).toBeLessThanOrEqual(100))
  })

  it("hard-splits a single block larger than maxChars", () => {
    const out = chunkMarkdown("y".repeat(250), { maxChars: 100, overlap: 0 })
    expect(out.map((c) => c.text.length)).toEqual([100, 100, 50])
  })

  it("prepends the previous chunk's tail as overlap (after the first chunk)", () => {
    const md = ["A".repeat(60), "B".repeat(60)].join("\n\n")
    const out = chunkMarkdown(md, { maxChars: 70, overlap: 10 })
    expect(out).toHaveLength(2)
    expect(out[0].text).toBe("A".repeat(60))
    // 2nd chunk carries the last 10 chars of chunk 0 as a bridge.
    expect(out[1].text.startsWith("A".repeat(10) + "\n\n")).toBe(true)
    expect(out[1].text.endsWith("B".repeat(60))).toBe(true)
  })
})
