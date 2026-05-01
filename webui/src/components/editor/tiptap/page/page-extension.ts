import { Extension } from "@tiptap/core"
import type { PageProvider } from "./types"


/**
 * Holds the host-provided PageProvider on the editor instance so other
 * page-related extensions (suggestion, NodeView) can access it via
 * `editor.storage.pageProvider.provider`.
 */
export const PageProviderExtension = Extension.create<{
  provider: PageProvider | null
}>({
  name: "pageProvider",

  addOptions() {
    return { provider: null }
  },

  addStorage() {
    return { provider: this.options.provider }
  },
})
