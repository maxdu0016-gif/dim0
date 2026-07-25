/**
 * Document-citation helpers (F2 B7) — pure, render-time, non-mutating.
 *
 * Sources are derived from what `doc_search` actually returned this turn (keyed
 * by the unique `docId`), NOT parsed from the answer text — so a citation can
 * never be ambiguous or mis-repaired. Titles are unique per board, so an exact
 * title occurrence in the answer can be safely linkified to its document.
 */
import type { AgentResponse } from "../types/stream"
import { isToolCallStep } from "../types/stream"


/** A cited document: its unique id, label, and the passages the agent retrieved. */
export type DocSource = { docId: string; docTitle: string; passages: string[] }


/**
 * Collect the distinct documents `doc_search` surfaced across an answer's steps,
 * in first-seen order, each with its retrieved passages (deduped). Keyed by
 * `docId` so same-title docs never merge.
 */
export const extractDocSources = (answer: AgentResponse): DocSource[] => {
  const byId = new Map<string, DocSource>()
  for (const step of answer.steps) {
    if (!isToolCallStep(step) || typeof step.output === "string" || step.output.type !== "doc_search") {
      continue
    }
    for (const ref of step.output.references) {
      if (!ref.docId) continue
      const existing = byId.get(ref.docId)
      const passage = ref.text.trim()
      if (existing) {
        if (passage && !existing.passages.includes(passage)) existing.passages.push(passage)
      } else {
        byId.set(ref.docId, {
          docId: ref.docId,
          docTitle: ref.docTitle,
          passages: passage ? [passage] : [],
        })
      }
    }
  }
  return [...byId.values()]
}


const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")


/**
 * Wrap exact occurrences of a cited document's title in the answer markdown with
 * a link to its Sources anchor (`#doc-<docId>`). Non-mutating in spirit: only
 * exact title strings are decorated, longest-first so a title that contains
 * another isn't half-matched, and occurrences already inside a markdown link
 * `](...)` are left alone. Unknown/misspelled references are simply not linked.
 */
export const linkifyDocTitles = (markdown: string, sources: DocSource[]): string => {
  const titled = sources.filter((s) => s.docTitle.trim().length > 0)
  if (titled.length === 0) return markdown
  // Longest titles first so "Report v2.pdf" wins over "Report".
  const ordered = [...titled].sort((a, b) => b.docTitle.length - a.docTitle.length)

  let out = markdown
  for (const s of ordered) {
    const title = escapeRegExp(s.docTitle)
    // Boundaries: not preceded by a word char or "[" (avoids substring matches
    // like "notes.pdf" inside "mynotes.pdf", and titles already inside a link),
    // and not followed by a word char or "](" (avoids "Report.pdf" in
    // "Report.pdfx", and double-wrapping an existing link).
    const re = new RegExp(`(?<![\\w[])${title}(?![\\w]|\\]\\()`, "g")
    out = out.replace(re, (match) => `[${match}](#doc-${s.docId})`)
  }
  return out
}
