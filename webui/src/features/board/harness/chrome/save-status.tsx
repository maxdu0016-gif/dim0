import { cn } from "@/lib/utils"
import type { SaveStatus } from "../persist/use-debounced-save"


const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: "",
  pending: "Edited",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
}


const STATUS_CLASS: Record<SaveStatus, string> = {
  idle: "",
  pending: "text-amber-600 dark:text-amber-400",
  saving: "text-muted-foreground",
  saved: "text-emerald-600 dark:text-emerald-400",
  error: "text-destructive",
}


/**
 * Save-status label. Plain text — save is just a status, not an
 * interactive surface, so no border / background / shadow. Empty
 * render when idle so the label disappears between edits instead of
 * squatting "Saved" forever.
 *
 * Layout is owned by the caller — the host (`harness-canvas.tsx`)
 * places this inside a top-right flex container alongside the
 * Share button.
 */
export function HarnessSaveStatus({ status }: { status: SaveStatus }) {
  const label = STATUS_LABEL[status]
  if (!label) return null
  return (
    <span
      className={cn("px-1 text-xs", STATUS_CLASS[status])}
      aria-live="polite"
    >
      {label}
    </span>
  )
}
