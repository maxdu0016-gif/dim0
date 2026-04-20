import { createElement, createRef } from "react"
import { createRoot } from "react-dom/client"
import type { SuggestionOptions } from "@tiptap/suggestion"
import { SlashMenu, type SlashMenuHandle } from "./slash-menu"
import { filterCommands, type SlashCommand } from "./commands"
import type { Editor, Range } from "@tiptap/core"

export const slashSuggestion: Omit<SuggestionOptions, "editor"> = {
  char: "/",
  allowSpaces: false,

  items({ query }) {
    return filterCommands(query)
  },

  render() {
    // menuRef lives inside render() — one per editor instance
    const menuRef = createRef<SlashMenuHandle>()
    let container: HTMLDivElement | null = null
    let root: ReturnType<typeof createRoot> | null = null

    return {
      onStart(props) {
        const rect = props.clientRect?.()
        if (!rect) return

        container = document.createElement("div")
        container.style.cssText = `
          position: fixed;
          z-index: 9999;
          top: ${rect.bottom + 6}px;
          left: ${rect.left}px;
        `
        document.body.appendChild(container)
        root = createRoot(container)
        root.render(
          createElement(SlashMenu, {
            ref: menuRef,
            items: props.items as SlashCommand[],
            command: (item) => props.command(item),
          })
        )
      },

      onUpdate(props) {
        const rect = props.clientRect?.()
        if (!container || !root) return
        if (rect) {
          container.style.top = `${rect.bottom + 6}px`
          container.style.left = `${rect.left}px`
        }
        root.render(
          createElement(SlashMenu, {
            ref: menuRef,
            items: props.items as SlashCommand[],
            command: (item) => props.command(item),
          })
        )
      },

      onKeyDown({ event }) {
        if (event.key === "Escape") {
          root?.unmount()
          container?.remove()
          root = null
          container = null
          return true
        }
        return menuRef.current?.onKeyDown(event) ?? false
      },

      onExit() {
        root?.unmount()
        container?.remove()
        root = null
        container = null
      },
    }
  },

  // props here is the SlashCommand item passed via props.command(item) in render
  command({ editor, range, props }) {
    const item = props as SlashCommand
    item.action(editor as Editor, range as Range)
  },
}
