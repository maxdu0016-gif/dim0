import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import CharacterCount from "@tiptap/extension-character-count"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import Link from "@tiptap/extension-link"
import Underline from "@tiptap/extension-underline"
import Typography from "@tiptap/extension-typography"
import { Markdown } from "tiptap-markdown"
import { Extension } from "@tiptap/core"
import Suggestion from "@tiptap/suggestion"
import { Mathematics } from "@tiptap/extension-mathematics"
import { TableKit } from "@tiptap/extension-table"
import { ShikiCodeBlock } from "./code-block/code-block-extension"
import { slashSuggestion } from "./slash-command/suggestion"
import "katex/dist/katex.min.css"

const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...slashSuggestion,
      }),
    ]
  },
})

/** Traps Tab inside the editor: indents in code blocks, sinks list items elsewhere, and prevents focus escape everywhere. */
const TabHandler = Extension.create({
  name: "tabHandler",
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const { editor } = this
        if (editor.isActive("codeBlock")) {
          const { state, view } = editor
          const { from, to } = state.selection
          view.dispatch(state.tr.insertText("\t", from, to))
          return true
        }
        if (editor.isActive("listItem")) return editor.commands.sinkListItem("listItem")
        if (editor.isActive("taskItem")) return editor.commands.sinkListItem("taskItem")
        return true // consume Tab everywhere else to prevent focus escape
      },
      "Shift-Tab": () => {
        const { editor } = this
        if (editor.isActive("listItem")) return editor.commands.liftListItem("listItem")
        if (editor.isActive("taskItem")) return editor.commands.liftListItem("taskItem")
        return true
      },
    }
  },
})

export function getExtensions(placeholder = "Start writing…") {
  return [
    StarterKit.configure({
      // Phase 1: undo/redo enabled. When adding Yjs: set undoRedo: false and add @tiptap/extension-collaboration
      codeBlock: false, // replaced by ShikiCodeBlock
    }),
    ShikiCodeBlock,
    Mathematics,
    TableKit,
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
    SlashCommand,
    TabHandler, // must be last — highest priority in TipTap's keymap chain
  ]
}
