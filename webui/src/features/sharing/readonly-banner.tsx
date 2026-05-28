import { useBoardAppStore } from "@/features/board/harness/store/board-app-store"


/**
 * Persistent banner shown when the signed-in user is a viewer on the
 * current board. Sits top-center; pure overlay so it doesn't capture
 * canvas pointer events. Hidden in presentation mode (since the user
 * is already in display-only flow).
 *
 * The actual "edits don't persist" enforcement lives server-side
 * (Phase A Slice 2 returns `op-rejected` for viewer ops); this is the
 * user-facing signal that explains why.
 */
export function ReadonlyBanner() {
  const boardRole = useBoardAppStore((s) => s.boardRole)
  const presentationMode = useBoardAppStore((s) => s.presentationMode)

  if (boardRole !== "viewer") return null
  if (presentationMode) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute left-1/2 top-14 z-40 -translate-x-1/2"
    >
      <div className="pointer-events-auto rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
        <span className="font-medium">Read-only view</span>
        <span className="ml-2 text-muted-foreground">
          You can browse but not edit this board.
        </span>
      </div>
    </div>
  )
}
