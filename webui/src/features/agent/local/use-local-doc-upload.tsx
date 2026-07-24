/* eslint-disable react-refresh/only-export-components -- this is a hook module (it returns a dialog element + drives toasts), not a component file. */
import { useCallback, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { CircleNotchIcon } from "@/components/icons"
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
// the same limits authoritatively. Keep in sync with MAX_PDF_BYTES.
const MAX_FILE_BYTES = 5 * 1024 * 1024


export type LocalDocUpload = {
  /** False when parsing is unavailable (no managed access and no BYOK key) → grey out. */
  canParse: boolean
  busy: boolean
  /** Open a native file picker and ingest the chosen PDF (guards double-pick). */
  pick: () => void
  /** The same-name override confirm dialog — render it once at the call site. */
  overrideDialog: ReactNode
}


/**
 * Shared PDF upload flow for a local board: OCR via `/ai/parse`, chunk + persist,
 * reindex, and drop a `document` node on the canvas. Backs BOTH the chat attach
 * button and the toolbar "Document" item so they behave identically.
 *
 * Titles are unique per board (the offline-first analog of a filename in a
 * folder): a same-name upload prompts to override in place. `canParse` is false
 * when parsing is unavailable (no managed access and no BYOK Mistral key).
 */
export const useLocalDocUpload = (boardId: string): LocalDocUpload => {
  const signedIn = useIsSignedIn()
  // Raw so the button re-enables the moment a signed-out user saves a key.
  const byokKey = useByokStore((s) => s.parseKey).trim() || null
  // Synchronous re-entrancy guard: `busy` state lags a render, so a rapid second
  // pick could slip through before it flips. A ref closes that window.
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [override, setOverride] = useState<File | null>(null)
  const canParse = resolveParseClient({ signedIn, byokKey }) !== null

  const ingest = useCallback(
    async (file: File): Promise<void> => {
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
        toast.success(`${replaced ? "Replaced" : "Added"} ${file.name} — ${chunks} passages ready to ask about.`)
      } catch (err) {
        toast.dismiss(id)
        toast.error(err instanceof Error ? `Couldn't read the PDF: ${err.message}` : "Couldn't read the PDF.")
      } finally {
        setBusy(false)
      }
    },
    [boardId, signedIn, byokKey],
  )

  const onPickFile = useCallback(
    async (file: File): Promise<void> => {
      if (busy || inFlight.current) return
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
    },
    [boardId, busy, ingest],
  )

  const pick = useCallback((): void => {
    if (!canParse || busy || inFlight.current) return
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "application/pdf,.pdf"
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) void onPickFile(file)
    }
    input.click()
  }, [canParse, busy, onPickFile])

  const overrideDialog = (
    <AlertDialog open={override !== null} onOpenChange={(o) => !o && setOverride(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replace “{override?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            A document with this name is already on this board. Uploading will replace its contents.
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
  )

  return { canParse, busy, pick, overrideDialog }
}


const Spinner = () => (
  <CircleNotchIcon className="size-4 animate-spin [animation-duration:750ms]" strokeWidth={2} />
)
