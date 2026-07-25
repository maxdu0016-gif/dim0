import { describe, expect, it } from "vitest"
import { chunkMarkdown, type Chunk } from "./doc-chunk"


const strip = (s: string): string => s.replace(/\s/g, "")
const joined = (chunks: Chunk[]): string => chunks.map((c) => c.text).join("\n\n")


describe("chunkMarkdown — basics", () => {
  it("returns [] for empty or whitespace-only input", () => {
    expect(chunkMarkdown("")).toEqual([])
    expect(chunkMarkdown("   \n\n  ")).toEqual([])
    expect(chunkMarkdown("\r\n\r\n \t ")).toEqual([])
  })

  it("keeps a short document as a single chunk with index 0", () => {
    const out = chunkMarkdown("# Title\n\nA short paragraph.")
    expect(out).toEqual([{ index: 0, text: "# Title\n\nA short paragraph." }])
  })
})


describe("chunkMarkdown — invariants (hold for any input/options)", () => {
  const cases: { name: string; md: string; maxChars: number; overlap: number }[] = [
    { name: "many small paras", md: Array.from({ length: 30 }, (_, i) => `para ${i} ${"x".repeat(30)}`).join("\n\n"), maxChars: 100, overlap: 0 },
    { name: "with overlap", md: Array.from({ length: 12 }, (_, i) => `para ${i} ${"y".repeat(50)}`).join("\n\n"), maxChars: 120, overlap: 20 },
    { name: "one giant block", md: "z".repeat(1000), maxChars: 100, overlap: 0 },
    { name: "giant then small", md: "z".repeat(250) + "\n\ntail", maxChars: 100, overlap: 0 },
    { name: "small then giant", md: "head\n\n" + "z".repeat(250), maxChars: 100, overlap: 0 },
    { name: "headings only", md: "# A\n\n## B\n\n### C", maxChars: 100, overlap: 0 },
    { name: "ragged blank lines", md: "a\n\n\n\n\nb\n\n\n c ", maxChars: 100, overlap: 0 },
    { name: "block exactly maxChars", md: "q".repeat(100), maxChars: 100, overlap: 0 },
    { name: "block maxChars+1", md: "q".repeat(101), maxChars: 100, overlap: 0 },
  ]

  for (const { name, md, maxChars, overlap } of cases) {
    it(`[${name}] indices are sequential and chunks are non-empty`, () => {
      const out = chunkMarkdown(md, { maxChars, overlap })
      out.forEach((c, i) => expect(c.index).toBe(i))
      out.forEach((c) => expect(c.text.trim().length).toBeGreaterThan(0))
    })

    it(`[${name}] is deterministic`, () => {
      expect(chunkMarkdown(md, { maxChars, overlap })).toEqual(chunkMarkdown(md, { maxChars, overlap }))
    })
  }

  it("overlap=0 loses no content (stripped concat === stripped source)", () => {
    for (const { md, maxChars } of cases) {
      const out = chunkMarkdown(md, { maxChars, overlap: 0 })
      // Packing only inserts whitespace and hard-split only slices → no chars lost.
      expect(strip(joined(out))).toBe(strip(md))
    }
  })

  it("overlap=0 → no chunk exceeds maxChars", () => {
    for (const { md, maxChars } of cases) {
      for (const c of chunkMarkdown(md, { maxChars, overlap: 0 })) {
        expect(c.text.length).toBeLessThanOrEqual(maxChars)
      }
    }
  })
})


describe("chunkMarkdown — packing + hard-split boundaries", () => {
  it("does not split a block that is exactly maxChars", () => {
    expect(chunkMarkdown("q".repeat(100), { maxChars: 100, overlap: 0 })).toEqual([
      { index: 0, text: "q".repeat(100) },
    ])
  })

  it("hard-splits a single block larger than maxChars into ceil(len/maxChars) pieces", () => {
    const out = chunkMarkdown("y".repeat(250), { maxChars: 100, overlap: 0 })
    expect(out.map((c) => c.text.length)).toEqual([100, 100, 50])
  })

  it("flushes a pending small block before hard-splitting a following giant block", () => {
    const out = chunkMarkdown("head\n\n" + "z".repeat(250), { maxChars: 100, overlap: 0 })
    expect(out[0].text).toBe("head") // not merged into the giant fragments
    expect(out.slice(1).map((c) => c.text.length)).toEqual([100, 100, 50])
  })

  it("starts a fresh chunk for a small block after a hard-split giant block", () => {
    const out = chunkMarkdown("z".repeat(250) + "\n\ntail", { maxChars: 100, overlap: 0 })
    expect(out.map((c) => c.text)).toEqual(["z".repeat(100), "z".repeat(100), "z".repeat(50), "tail"])
  })

  it("packs multiple blocks into one chunk when they fit", () => {
    const out = chunkMarkdown("aaa\n\nbbb\n\nccc", { maxChars: 100, overlap: 0 })
    expect(out).toEqual([{ index: 0, text: "aaa\n\nbbb\n\nccc" }])
  })
})


describe("chunkMarkdown — overlap", () => {
  it("prepends the previous chunk's tail to each subsequent chunk (not the first)", () => {
    const md = ["A".repeat(60), "B".repeat(60)].join("\n\n")
    const out = chunkMarkdown(md, { maxChars: 70, overlap: 10 })
    expect(out).toHaveLength(2)
    expect(out[0].text).toBe("A".repeat(60)) // first chunk: no prefix
    expect(out[1].text).toBe("A".repeat(10) + "\n\n" + "B".repeat(60))
  })

  it("clamps an overlap >= maxChars to maxChars-1 without throwing", () => {
    const md = ["A".repeat(40), "B".repeat(40)].join("\n\n")
    const out = chunkMarkdown(md, { maxChars: 50, overlap: 999 })
    expect(out).toHaveLength(2)
    // bounded by the previous chunk length (40) and the clamp (49) → 40.
    expect(out[1].text.startsWith("A".repeat(40) + "\n\n")).toBe(true)
  })
})


describe("chunkMarkdown — line endings", () => {
  it("splits CRLF-delimited paragraphs (PDF exports) the same as LF", () => {
    const crlf = "para one\r\n\r\npara two\r\n\r\npara three"
    const lf = "para one\n\npara two\n\npara three"
    expect(chunkMarkdown(crlf, { maxChars: 20, overlap: 0 })).toEqual(
      chunkMarkdown(lf, { maxChars: 20, overlap: 0 }),
    )
    // and it actually produced >1 chunk (i.e. the blank lines were recognized)
    expect(chunkMarkdown(crlf, { maxChars: 20, overlap: 0 }).length).toBeGreaterThan(1)
  })
})
