import type { Editor } from "@tiptap/react"
import {
  ArrowCounterClockwise,
  ArrowClockwise,
  TextB,
  TextItalic,
  TextUnderline,
  TextStrikethrough,
  Link,
  CaretDown,
  Code,
  Quotes,
  ListBullets,
  ListNumbers,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type Props = { editor: Editor }

function Divider() {
  return <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />
}

function TBtn({
  onClick,
  active,
  disabled,
  tooltip,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  tooltip: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault() // keep editor focus
            if (!disabled) onClick()
          }}
          disabled={disabled}
          data-active={active}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
            "text-muted-foreground hover:bg-muted hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-40",
            active && "bg-secondary text-secondary-foreground hover:bg-secondary/80",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

const STYLES = [
  { label: "Paragraph", key: "paragraph", action: (e: Editor) => e.chain().focus().setParagraph().run() },
  { label: "Heading 1", key: "h1", action: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: "Heading 2", key: "h2", action: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: "Heading 3", key: "h3", action: (e: Editor) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: "Code block", key: "code", action: (e: Editor) => e.chain().focus().toggleCodeBlock().run() },
  { label: "Quote", key: "quote", action: (e: Editor) => e.chain().focus().toggleBlockquote().run() },
] as const

function currentStyle(editor: Editor): string {
  if (editor.isActive("heading", { level: 1 })) return "Heading 1"
  if (editor.isActive("heading", { level: 2 })) return "Heading 2"
  if (editor.isActive("heading", { level: 3 })) return "Heading 3"
  if (editor.isActive("codeBlock")) return "Code block"
  if (editor.isActive("blockquote")) return "Quote"
  return "Paragraph"
}

export function Toolbar({ editor }: Props) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-border bg-sidebar px-2">
      {/* ── undo / redo ──────────────────────────────────────── */}
      <TBtn
        tooltip="Undo (Ctrl+Z)"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <ArrowCounterClockwise size={16} />
      </TBtn>
      <TBtn
        tooltip="Redo (Ctrl+Y)"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <ArrowClockwise size={16} />
      </TBtn>

      <Divider />

      {/* ── style dropdown ───────────────────────────────────── */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span className="font-sans">{currentStyle(editor)}</span>
            <CaretDown size={12} weight="bold" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-36 font-sans text-sm">
          {STYLES.map((s) => (
            <DropdownMenuItem
              key={s.key}
              onMouseDown={(e) => {
                e.preventDefault()
                s.action(editor)
              }}
              className={cn(currentStyle(editor) === s.label && "bg-secondary text-secondary-foreground")}
            >
              {s.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Divider />

      {/* ── marks ────────────────────────────────────────────── */}
      <TBtn
        tooltip="Bold (Ctrl+B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <TextB size={16} weight="bold" />
      </TBtn>
      <TBtn
        tooltip="Italic (Ctrl+I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <TextItalic size={16} />
      </TBtn>
      <TBtn
        tooltip="Underline (Ctrl+U)"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <TextUnderline size={16} />
      </TBtn>
      <TBtn
        tooltip="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <TextStrikethrough size={16} />
      </TBtn>

      <Divider />

      {/* ── inline elements ───────────────────────────────────── */}
      <TBtn
        tooltip="Code (Ctrl+E)"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code size={16} />
      </TBtn>
      <TBtn
        tooltip="Link"
        active={editor.isActive("link")}
        onClick={() => {
          if (editor.isActive("link")) {
            editor.chain().focus().unsetLink().run()
          } else {
            const url = window.prompt("URL")
            if (url) editor.chain().focus().setLink({ href: url }).run()
          }
        }}
      >
        <Link size={16} />
      </TBtn>

      <Divider />

      {/* ── lists ────────────────────────────────────────────── */}
      <TBtn
        tooltip="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <ListBullets size={16} />
      </TBtn>
      <TBtn
        tooltip="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListNumbers size={16} />
      </TBtn>
      <TBtn
        tooltip="Blockquote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quotes size={16} />
      </TBtn>
    </div>
  )
}
