import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  filterPickerCategories,
  PICKER_CATEGORIES,
  type PickerCategory,
  type PickerIconEntry,
} from "./picker-set"


export type IconPickerProps = {
  onSelect: (name: string) => void
  selected?: string | null
  className?: string
}


/**
 * Notion-style icon picker: search bar over a scrollable list of category
 * sections, each holding a dense grid of Phosphor icons. Intended to be
 * mounted via React.lazy from consumers so the curated icon set ships in
 * its own chunk.
 */
export const IconPicker = ({ onSelect, selected, className }: IconPickerProps) => {
  const [query, setQuery] = useState("")

  const filtered = useMemo(
    () => filterPickerCategories(PICKER_CATEGORIES, query),
    [query],
  )

  const hasResults = filtered.some((category) => category.icons.length > 0)

  return (
    <div
      className={cn(
        "flex h-[420px] w-[360px] flex-col rounded-md border bg-popover text-popover-foreground shadow-md",
        className,
      )}
    >
      <div className="border-b p-2">
        <Input
          autoFocus
          placeholder="Search icons..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-8"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {hasResults ? (
          filtered.map((category) =>
            category.icons.length === 0 ? null : (
              <CategorySection
                key={category.id}
                category={category}
                selected={selected}
                onSelect={onSelect}
              />
            ),
          )
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No icons match "{query}"
          </div>
        )}
      </div>
    </div>
  )
}


type CategorySectionProps = {
  category: PickerCategory
  selected?: string | null
  onSelect: (name: string) => void
}


const CategorySection = ({ category, selected, onSelect }: CategorySectionProps) => {
  return (
    <section className="mb-3 last:mb-0">
      <h3 className="mb-1 px-1 text-xs font-medium text-muted-foreground">
        {category.label}
      </h3>
      <div className="grid grid-cols-8 gap-1">
        {category.icons.map((icon) => (
          <IconCell
            key={icon.name}
            icon={icon}
            isSelected={selected === icon.name}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  )
}


type IconCellProps = {
  icon: PickerIconEntry
  isSelected: boolean
  onSelect: (name: string) => void
}


const IconCell = ({ icon, isSelected, onSelect }: IconCellProps) => {
  const Glyph = icon.component

  return (
    <button
      type="button"
      title={icon.name}
      aria-label={icon.name}
      onClick={() => onSelect(icon.name)}
      className={cn(
        "flex aspect-square items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        isSelected && "bg-accent text-accent-foreground ring-2 ring-ring",
      )}
    >
      <Glyph size={20} weight="regular" />
    </button>
  )
}


