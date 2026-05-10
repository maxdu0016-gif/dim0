import { Fragment } from "react"
import { CaretRightIcon } from "@phosphor-icons/react"
import {
  FolderIcon,
  NotepadIcon,
  CodeFileIcon,
  StockWidgetIcon,
  type AppIconComponent,
} from "@/components/icons"
import { trimText } from "@/lib/common"
import { UNTITLED_LABEL } from "../../const"
import type { Note } from "../../types/note"


export type BreadcrumbSegmentKind = "folder" | "sheet" | "code-sandbox" | "widget" | "other"


function kindOf(note: Note): BreadcrumbSegmentKind {
  const t = note.style?.type
  if (t === "folder" || t === "sheet" || t === "code-sandbox" || t === "widget") return t
  return "other"
}


const ICON_BY_KIND: Record<BreadcrumbSegmentKind, AppIconComponent | null> = {
  folder: FolderIcon,
  sheet: NotepadIcon,
  "code-sandbox": CodeFileIcon,
  widget: StockWidgetIcon,
  other: null,
}


interface Props {
  /** Ancestor notes leading up to (but excluding) the current page. */
  ancestors: Note[]
  /**
   * Called when the user clicks an ancestor segment. The host decides how
   * to navigate based on the segment's kind: folder → canvas inside the
   * folder, sheet/code/widget → that node's surface dialog.
   */
  onSegmentClick: (note: Note, kind: BreadcrumbSegmentKind) => void
}


/**
 * Breadcrumb shown above the current sheet's title. Each segment carries
 * a kind-specific icon and the host-supplied click handler routes per
 * kind so folder ancestors don't get opened as sheets.
 */
export function SheetBreadcrumb({ ancestors, onSegmentClick }: Props) {
  if (ancestors.length === 0) return null

  return (
    <nav
      className="flex items-center gap-1.5 text-xs text-muted-foreground/80"
      aria-label="Breadcrumb"
    >
      {ancestors.map((note, i) => {
        const kind = kindOf(note)
        const Icon = ICON_BY_KIND[kind]
        const fullLabel = note.label?.markdown?.trim() || UNTITLED_LABEL
        return (
          <Fragment key={note.id}>
            <button
              type="button"
              onClick={() => onSegmentClick(note, kind)}
              title={fullLabel}
              className="flex items-center gap-1 truncate max-w-[180px] rounded transition-colors hover:text-foreground"
            >
              {Icon && <Icon className="size-3.5 shrink-0 opacity-70" strokeWidth={2} />}
              <span className="truncate">{trimText(fullLabel, 28)}</span>
            </button>
            {i < ancestors.length - 1 && (
              <CaretRightIcon className="size-3 shrink-0 opacity-50" />
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
