import { useBoardAppStore } from "../store/board-app-store"


/**
 * Compact "Read-only" indicator that lives in the top-right chrome row
 * alongside save status, peer chip, share, etc. Shown only when the
 * signed-in user is a viewer on the current board — the same gate
 * that hides the Share button.
 *
 * Wording is short by design (the row stays uncluttered); the existing
 * `ReadonlyBanner` carries the full explanation. Hidden in
 * presentation mode where the read-only state is implicit.
 */
export function HarnessReadonlyChip() {
  const boardRole = useBoardAppStore((s) => s.boardRole)
  const presentationMode = useBoardAppStore((s) => s.presentationMode)

  if (boardRole !== "viewer") return null
  if (presentationMode) return null

  return (
    <span
      className="px-1 text-xs font-medium text-amber-600 dark:text-amber-400"
      role="status"
      aria-label="Board is read-only"
    >
      Read-only
    </span>
  )
}
