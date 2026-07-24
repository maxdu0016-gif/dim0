import { useRef, useState } from "react"
import { toast } from "sonner"
import { CircleNotchIcon, DocumentFileIcon } from "@/components/icons"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { generateUuid } from "@/lib/common"
import { useIsSignedIn } from "@/lib/auth"
import { useByokStore } from "@/features/agent/byok/byok-store"
import { getLocalStores } from "@/features/local-stores"
import { getCanvasStoreRef } from "@/features/board/harness/canvas-store-ref"
import { useBoardAppStore } from "@/features/board/harness/store/board-app-store"
import { addDocumentNode } from "@/features/board/harness/agent/doc-node"
import { resolveParseClient } from "@/features/agent/engine/doc-parse"
import { ingestDocument } from "@/features/agent/local/ingest-doc"


// Instant client-side reject (saves the upload); the /ai/parse endpoint enforces
// the same limits authoritatively. Keep MAX_FILE_BYTES in sync with MAX_PDF_BYTES.
const MAX_FILE_BYTES = 5 * 1024 * 1024


/**
 * Attach a PDF to the current local board for document Q&A: OCR it to markdown
 * (via `/ai/parse`), chunk + persist it, and rebuild the board's search index so
 * the agent's `doc_search` tool can ground answers in it.
 *
 * Titles are unique per board (the offline-first analog of a filename in a
 * folder): a same-name upload prompts to override in place. Greys out when
 * parsing is unavailable (no managed access and no BYOK Mistral key).
 */
export const DocAttachButton = ({ boardId }: { boardId: string }) => {
  const signedIn = useIsSignedIn()
  // The user's Mistral key (if any). Selected raw so the button re-enables the
  // moment a signed-out user saves one in Settings → Documents.
  const byokKey = useByokStore((s) => s.parseKey).trim() || null
  const inputRef = useRef<HTMLInputElement>(null)
  // Synchronous re-entrancy guard: `busy` state lags a render, so a rapid second
  // file-select could slip through before it flips. A ref closes that window.
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [override, setOverride] = useState<File | null>(null)
  const canParse = resolveParseClient({ signedIn, byokKey }) !== null

  const ingest = async (file: File): Promise<void> => {
    const client = resolveParseClient({ signedIn, runId: generateUuid(), byokKey })
    if (!client) {
      toast.error("Sign in or add a Mistral key to upload documents.")
      return
    }
    setBusy(true)
    const id = toast(`Reading ${file.name}…`, { icon: <Spinner />, duration: Infinity })
    try {
      const { markdown, pages } = await client.parse(file)
      const { docId, chunks, replaced } = await ingestDocument({ boardId, title: file.name, markdown, pages })
      toast.dismiss(id)
      if (chunks === 0 || !docId) {
        toast.error("No readable text found in that PDF.")
        return
      }
      // Surface the document as a node on the canvas (id = docId). No-op on a
      // same-name override (the node already exists).
      const store = getCanvasStoreRef()
      if (store) addDocumentNode(store, { docId, title: file.name, boardId, rootId: useBoardAppStore.getState().rootId })
      toast.success(
        `${replaced ? "Replaced" : "Added"} ${file.name} — ${chunks} passages ready to ask about.`,
      )
    } catch (err) {
      toast.dismiss(id)
      toast.error(err instanceof Error ? `Couldn't read the PDF: ${err.message}` : "Couldn't read the PDF.")
    } finally {
      setBusy(false)
    }
  }

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-picking the same file
    if (!file || busy || inFlight.current) return
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`PDF must be under ${MAX_FILE_BYTES / (1024 * 1024)} MB.`)
      return
    }
    inFlight.current = true
    try {
      // Same-name on this board → confirm override (parse only AFTER the user
      // decides, so a cancelled override never spends an OCR call).
      const { docs } = await getLocalStores()
      const existing = await docs.findByTitle(boardId, file.name)
      if (existing) setOverride(file)
      else await ingest(file)
    } finally {
      inFlight.current = false
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

      <AlertDialog open={override !== null} onOpenChange={(o) => !o && setOverride(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace “{override?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              A document with this name is already on this board. Uploading will replace its
              contents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOverride(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const file = override
                setOverride(null)
                if (file) void ingest(file)
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}


const Spinner = () => (
  <CircleNotchIcon className="size-4 animate-spin [animation-duration:750ms]" strokeWidth={2} />
)
