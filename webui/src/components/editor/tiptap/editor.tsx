import { useEffect, useRef } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import { useDebouncedCallback } from "use-debounce"
import { getExtensions } from "./extensions"
import { Toolbar } from "./toolbar"
import { EditorBubbleMenu } from "./bubble-menu"
import { StatusBar } from "./status-bar"
import "./editor.css"

export interface MdEditorProps {
  markdown: string
  onSave: (markdown: string) => void
  placeholder?: string
  className?: string
}

export function TipTapEditor({ markdown, onSave, placeholder, className }: MdEditorProps) {
  const onSaveRef = useRef(onSave)
  useEffect(() => { onSaveRef.current = onSave }, [onSave])

  const debouncedSave = useDebouncedCallback((md: string) => {
    onSaveRef.current(md)
  }, 2000)

  const editor = useEditor({
    extensions: getExtensions(placeholder),
    content: markdown,
    immediatelyRender: false,
    onUpdate({ editor }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      debouncedSave((editor as any).storage.markdown.getMarkdown())
    },
  })

  // Ctrl+S / Cmd+S — flush debounce and save immediately
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        if (!editor) return
        debouncedSave.flush()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onSaveRef.current((editor as any).storage.markdown.getMarkdown())
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [editor, debouncedSave])

  // Flush on unmount so no pending saves are lost
  useEffect(() => () => { debouncedSave.flush() }, [debouncedSave])

  if (!editor) return null

  return (
    <div className={`flex h-full flex-col overflow-hidden${className ? ` ${className}` : ""}`}>
      <Toolbar editor={editor} />

      <div className="tiptap-editor editor-body scrollbar-thin min-h-0 flex-1">
        <EditorBubbleMenu editor={editor} />
        <EditorContent editor={editor} />
      </div>

      <StatusBar editor={editor} />
    </div>
  )
}
