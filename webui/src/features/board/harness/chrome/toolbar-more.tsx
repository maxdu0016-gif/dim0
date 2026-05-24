import { useState } from "react"
import { DotsThree, ImagesSquareIcon } from "@phosphor-icons/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ImageSearchDialog } from "./image-search-dialog"


/**
 * Overflow menu mounted at the right edge of the harness toolbar.
 * Houses affordances that don't earn a primary toolbar slot (image
 * search, future document upload, etc.). Mirrors prod's `⋯` More
 * dropdown in top-bar.tsx.
 */
export function HarnessToolbarMore() {
  const [openImageSearch, setOpenImageSearch] = useState(false)

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-md transition-colors",
                  "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <DotsThree className="size-4" weight="bold" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">More actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="end"
          side="bottom"
          sideOffset={8}
          className="min-w-[190px]"
        >
          <DropdownMenuItem
            onSelect={() => setOpenImageSearch(true)}
            className="gap-2 text-sm"
          >
            <ImagesSquareIcon className="size-4 shrink-0" />
            <span>Images</span>
            <DropdownMenuShortcut>I</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ImageSearchDialog
        open={openImageSearch}
        onOpenChange={setOpenImageSearch}
      />
    </>
  )
}
