import type { Editor } from "@tiptap/react"

type Props = { editor: Editor }

export function StatusBar({ editor }: Props) {
  const { words, characters } = editor.storage.characterCount

  return (
    <div className="flex h-7 shrink-0 items-center border-t border-border px-4">
      <span className="font-sans text-[11px] text-muted-foreground">
        {words()} words · {characters()} chars
      </span>
    </div>
  )
}
