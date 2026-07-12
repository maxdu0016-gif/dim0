import { cn } from "@/lib/utils"
import { SettingsDialog } from "./settings-dialog"


/** A key glyph — signals "set your API keys / open settings". */
function KeyGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-4 shrink-0" aria-hidden>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2 20 3m-3 0 3 3-3 3" />
    </svg>
  )
}


/**
 * Opens the unified agent settings dialog. `emphasize` lifts the key icon to
 * secondary-foreground with a soft ring — used when no model key is set and the
 * rest of the island is dimmed, to point the user at settings.
 */
export const SettingsButton = ({ emphasize = false }: { emphasize?: boolean }) => (
  <SettingsDialog
    trigger={
      <button
        type="button"
        title={emphasize ? "Set a key to start" : "Settings & keys"}
        aria-label="Agent settings"
        className={cn(
          "shrink-0 rounded-lg p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-foreground/30",
          emphasize
            ? "text-secondary-foreground ring-2 ring-secondary-foreground/30 hover:bg-accent"
            : "text-muted-foreground border border-transparent hover:border-border hover:bg-accent",
        )}
      >
        <KeyGlyph />
      </button>
    }
  />
)
