import { useRef, useState } from "react"
import { toast } from "sonner"
import { CircleNotchIcon, DocumentFileIcon } from "@/components/icons"
import { generateUuid } from "@/lib/common"
import { useIsSignedIn } from "@/lib/auth"
import { getLocalStores } from "@/features/local-stores"
import { resolveParseClient } from "@/features/agent/engine/doc-parse"
import { chunkMarkdown } from "@/features/agent/engine/doc-chunk"
import { refreshDocIndex } from "@/features/board/search/use-doc-index"


/**
 * Attach a PDF to the current local board for document Q&A: OCR it to markdown
 * (via `/ai/parse`), chunk + persist it, and rebuild the board's search index so
 * the agent's `doc_search` tool can ground answers in it.
 *
 * Greys out when parsing isn't available (no managed access and no BYOK Mistral
 * key → `resolveParseClient` is null), so the feature is blocked, not broken.
 */
export const DocAttachButton = ({ boardId }: { boardId: string }) => {
  const signedIn = useIsSignedIn()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const canParse = resolveParseClient({ signedIn }) !== null

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-picking the same file
    if (!file || busy) return

    const client = resolveParseClient({ signedIn, runId: generateUuid() })
    if (!client) {
      toast.error("Sign in or add a Mistral key to upload documents.")
      return
    }

    setBusy(true)
    const id = toast(`Reading ${file.name}…`, { icon: <Spinner />, duration: Infinity })
    try {
      const { markdown, pages } = await client.parse(file)
      const chunks = chunkMarkdown(markdown)
      if (chunks.length === 0) {
        toast.dismiss(id)
        toast.error("No readable text found in that PDF.")
        return
      }
      const docId = generateUuid()
      const { docs } = await getLocalStores()
      await docs.addDocument({ id: docId, boardId, title: file.name, pages, createdAt: Date.now() })
      await docs.addChunks(
        chunks.map((c) => ({ chunkId: `${docId}#${c.index}`, docId, boardId, index: c.index, text: c.text })),
      )
      await refreshDocIndex(boardId)
      toast.dismiss(id)
      toast.success(`Added ${file.name} — ${chunks.length} passages ready to ask about.`)
    } catch (err) {
      toast.dismiss(id)
      toast.error(err instanceof Error ? `Couldn't read the PDF: ${err.message}` : "Couldn't read the PDF.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => void onPick(e)}
      />
      <button
        type="button"
        disabled={!canParse || busy}
        onClick={() => inputRef.current?.click()}
        aria-label="Attach a PDF"
        title={canParse ? "Attach a PDF to ask about it" : "Sign in or add a Mistral key to attach documents"}
        className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-secondary-foreground disabled:opacity-40 disabled:pointer-events-none"
      >
        {busy ? <Spinner /> : <DocumentFileIcon className="size-4" strokeWidth={2} />}
      </button>
    </>
  )
}


const Spinner = () => (
  <CircleNotchIcon className="size-4 animate-spin [animation-duration:750ms]" strokeWidth={2} />
)
