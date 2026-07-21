/**
 * Markdown-aware chunker for document Q&A (F2 B3).
 *
 * Splits a document's markdown into retrieval chunks: greedily pack
 * paragraph-ish blocks (split on blank lines) up to `maxChars`, hard-splitting
 * any single oversized block, and carry a small `overlap` tail from the previous
 * chunk so a fact that straddles a boundary is still findable. Pure + synchronous
 * so it's trivially testable; ids are assigned by the indexer (B5), not here.
 */


export type Chunk = { index: number; text: string }


// ~1200 chars ≈ a few hundred tokens per chunk; 150-char overlap for continuity.
const DEFAULT_MAX_CHARS = 1200
const DEFAULT_OVERLAP = 150


/** Split markdown into overlapping chunks. Returns [] for empty/whitespace input. */
export const chunkMarkdown = (
  markdown: string,
  opts: { maxChars?: number; overlap?: number } = {},
): Chunk[] => {
  const maxChars = Math.max(1, opts.maxChars ?? DEFAULT_MAX_CHARS)
  const overlap = Math.max(0, Math.min(opts.overlap ?? DEFAULT_OVERLAP, maxChars - 1))

  // Normalize CRLF/CR so paragraph splitting works on PDF exports that use
  // Windows/old-Mac line endings (otherwise `\r\n\r\n` isn't a blank line).
  const text = markdown.replace(/\r\n?/g, "\n").trim()
  if (!text) return []

  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  const packed: string[] = []
  let cur = ""
  const flush = (): void => {
    if (cur) packed.push(cur)
    cur = ""
  }

  for (const block of blocks) {
    if (block.length > maxChars) {
      flush()
      for (let i = 0; i < block.length; i += maxChars) packed.push(block.slice(i, i + maxChars))
      continue
    }
    if (cur && cur.length + 2 + block.length > maxChars) flush()
    cur = cur ? `${cur}\n\n${block}` : block
  }
  flush()

  // Prepend the tail of the previous chunk (context bridge across boundaries).
  return packed.map((chunk, index) => {
    if (index === 0 || overlap === 0) return { index, text: chunk }
    return { index, text: `${packed[index - 1].slice(-overlap)}\n\n${chunk}` }
  })
}
