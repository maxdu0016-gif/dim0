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
import { getLocalStores } from "@/features/local-stores"
import { resolveParseClient } from "@/features/agent/engine/doc-parse"
import { ingestDocument } from "@/features/agent/local/ingest-doc"


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
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [override, setOverride] = useState<File | null>(null)
  const canParse = resolveParseClient({ signedIn }) !== null

  const ingest = async (file: File): Promise<void> => {
    const client = resolveParseClient({ signedIn, runId: generateUuid() })
    if (!client) {
      toast.error("Sign in or add a Mistral key to upload documents.")
      return
    }
    setBusy(true)
    const id = toast(`Reading ${file.name}…`, { icon: <Spinner />, duration: Infinity })
    try {
      const { markdown, pages } = await client.parse(file)
      const { chunks, replaced } = await ingestDocument({ boardId, title: file.name, markdown, pages })
      toast.dismiss(id)
      if (chunks === 0) {
        toast.error("No readable text found in that PDF.")
        return
      }
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
    if (!file || busy) return
    // Same-name on this board → confirm override (parse only AFTER the user
    // decides, so a cancelled override never spends an OCR call).
    const { docs } = await getLocalStores()
    const existing = await docs.findByTitle(boardId, file.name)
    if (existing) setOverride(file)
    else void ingest(file)
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
