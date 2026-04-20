import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import CharacterCount from "@tiptap/extension-character-count"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import Link from "@tiptap/extension-link"
import Underline from "@tiptap/extension-underline"
import Typography from "@tiptap/extension-typography"
import { Markdown } from "tiptap-markdown"

export function getExtensions(placeholder = "Start writing…") {
  return [
    StarterKit.configure({
      // Phase 1: undo/redo enabled. When adding Yjs: set undoRedo: false and add @tiptap/extension-collaboration
    }),
    Placeholder.configure({ placeholder }),
    CharacterCount,
    TaskList,
    TaskItem.configure({ nested: true }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { class: "editor-link" },
    }),
    Underline,
    Typography,
    Markdown.configure({
      html: false,
      transformCopiedText: true,
      transformPastedText: true,
    }),
  ]
}
