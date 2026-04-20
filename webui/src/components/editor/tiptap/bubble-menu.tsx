import type { Editor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import {
  TextB,
  TextItalic,
  TextUnderline,
  TextStrikethrough,
  Code,
  Link,
  Quotes,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

type Props = { editor: Editor }

function BBtn({
  onClick,
  active,
  tooltip,
  children,
}: {
  onClick: () => void
  active?: boolean
  tooltip: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={tooltip}
      onClick={onClick}
      data-active={active}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] transition-colors",
        "text-muted-foreground hover:bg-muted hover:text-foreground",
        active && "bg-secondary text-secondary-foreground",
      )}
    >
      {children}
    </button>
  )
}

function BDivider() {
  return <div className="mx-0.5 h-4 w-px shrink-0 bg-border" />
}

export function EditorBubbleMenu({ editor }: Props) {
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top" }}
      className={cn(
        "flex items-center gap-0.5 rounded-lg border border-border/70 bg-card px-1 py-0.5",
        "shadow-md",
      )}
    >
      {/* ── marks ────────────────────────────────────────────── */}
      <BBtn
        tooltip="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <TextB size={14} weight="bold" />
      </BBtn>
      <BBtn
        tooltip="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <TextItalic size={14} />
      </BBtn>
      <BBtn
        tooltip="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <TextUnderline size={14} />
      </BBtn>
      <BBtn
        tooltip="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <TextStrikethrough size={14} />
      </BBtn>

      <BDivider />

      {/* ── headings ─────────────────────────────────────────── */}
      <BBtn
        tooltip="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <span className="font-sans text-[11px] font-bold leading-none">H1</span>
      </BBtn>
      <BBtn
        tooltip="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <span className="font-sans text-[11px] font-bold leading-none">H2</span>
      </BBtn>
      <BBtn
        tooltip="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <span className="font-sans text-[11px] font-bold leading-none">H3</span>
      </BBtn>

      <BDivider />

      {/* ── inline specials ───────────────────────────────────── */}
      <BBtn
        tooltip="Inline code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code size={14} />
      </BBtn>
      <BBtn
        tooltip="Blockquote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quotes size={14} />
      </BBtn>
      <BBtn
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
        <Link size={14} />
      </BBtn>
    </BubbleMenu>
  )
}
