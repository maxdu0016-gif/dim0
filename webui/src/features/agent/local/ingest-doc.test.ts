import { beforeEach, describe, expect, it } from "vitest"
import { resetIdb } from "@/test/canvas"
import { getLocalStores } from "@/features/local-stores"
import { DocChunkIndex } from "@/features/board/search/doc-index"
import { setDocIndexRef } from "@/features/board/search/doc-index-ref"
import { ingestDocument } from "./ingest-doc"


beforeEach(() => resetIdb())


describe("ingestDocument", () => {
  it("chunks + persists a new document and reports the chunk count", async () => {
    const res = await ingestDocument({
      boardId: "b1",
      title: "Report.pdf",
      markdown: "# Q3\n\nRevenue grew 20%.\n\nHeadcount stayed flat.",
      pages: 1,
    })
    expect(res.replaced).toBe(false)
    expect(res.chunks).toBeGreaterThan(0)

    const { docs } = await getLocalStores()
    expect((await docs.listDocuments("b1")).map((d) => d.title)).toEqual(["Report.pdf"])
    expect((await docs.chunksForDoc(res.docId)).length).toBe(res.chunks)
  })

  it("chunk ids are the docId prefixed (stable + unique per doc)", async () => {
    const { docId } = await ingestDocument({ boardId: "b1", title: "A.pdf", markdown: "x".repeat(3000), pages: 1 })
    const { docs } = await getLocalStores()
    const ids = (await docs.chunksForDoc(docId)).map((c) => c.chunkId)
    expect(ids.every((id) => id.startsWith(`${docId}#`))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length) // unique
  })

  it("a same-title re-ingest overrides in place: same docId, chunks replaced, no duplicate doc", async () => {
    const first = await ingestDocument({ boardId: "b1", title: "Report.pdf", markdown: "old content here", pages: 1 })
    const second = await ingestDocument({ boardId: "b1", title: "Report.pdf", markdown: "brand new content", pages: 2 })

    expect(second.replaced).toBe(true)
    expect(second.docId).toBe(first.docId) // reused id → prior citations stay valid

    const { docs } = await getLocalStores()
    expect((await docs.listDocuments("b1")).length).toBe(1) // no duplicate
    expect((await docs.getDocument(first.docId))?.pages).toBe(2) // metadata updated
    const text = (await docs.chunksForDoc(first.docId)).map((c) => c.text).join(" ")
    expect(text).toContain("brand new content")
    expect(text).not.toContain("old content") // old chunks gone
  })

  it("refreshes the active doc index so the new content is searchable immediately", async () => {
    const index = new DocChunkIndex()
    setDocIndexRef(index)
    try {
      await ingestDocument({ boardId: "b1", title: "Bio.pdf", markdown: "Photosynthesis converts light.", pages: 1 })
      const hits = await index.query("photosynthesis")
      expect(hits[0]?.docTitle).toBe("Bio.pdf")
    } finally {
      setDocIndexRef(null)
    }
  })

  it("distinct titles on the same board coexist (each its own doc)", async () => {
    await ingestDocument({ boardId: "b1", title: "A.pdf", markdown: "alpha", pages: 1 })
    await ingestDocument({ boardId: "b1", title: "B.pdf", markdown: "beta", pages: 1 })
    const { docs } = await getLocalStores()
    expect((await docs.listDocuments("b1")).map((d) => d.title).sort()).toEqual(["A.pdf", "B.pdf"])
  })
})
