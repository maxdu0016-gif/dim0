import { Highlight } from "@tiptap/extension-highlight"
import type MarkdownIt from "markdown-it"


/**
 * Highlight mark with tiptap-markdown round-trip support.
 * Uses the Pandoc / markdown-it-mark convention `==text==` to serialize and
 * parse the `highlight` mark. Without this, the mark falls through to the
 * HTMLMark fallback in tiptap-markdown and disappears on save (because we
 * disable raw HTML).
 */
export const HighlightMarkdown = Highlight.extend({
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: "==",
          close: "==",
          mixable: true,
          expelEnclosingWhitespace: true,
        },
        parse: {
          setup(md: MarkdownIt) {
            md.inline.ruler.after("emphasis", "highlight", (state, silent) => {
              if (state.src.charCodeAt(state.pos) !== 0x3d /* '=' */) return false
              if (state.src.charCodeAt(state.pos + 1) !== 0x3d) return false

              const end = state.src.indexOf("==", state.pos + 2)
              if (end === -1) return false

              const content = state.src.slice(state.pos + 2, end)
              if (!content || content.includes("\n")) return false

              if (!silent) {
                state.push("highlight_open", "mark", 1)
                const text = state.push("text", "", 0)
                text.content = content
                state.push("highlight_close", "mark", -1)
              }
              state.pos = end + 2
              return true
            })

            md.renderer.rules.highlight_open = () => "<mark>"
            md.renderer.rules.highlight_close = () => "</mark>"
          },
        },
      },
    }
  },
})
