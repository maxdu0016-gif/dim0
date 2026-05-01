import { NodeViewWrapper } from "@tiptap/react"
import type { NodeViewProps } from "@tiptap/react"
import { FileText } from "@phosphor-icons/react"
import type { PageProvider } from "./types"


function getProvider(editor: NodeViewProps["editor"]): PageProvider | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storage = (editor.storage as any).pageProvider
  return storage?.provider ?? null
}


/**
 * Inline page-reference chip. Click navigates via the host's PageProvider;
 * shows the title snapshot stored in the doc, ready for hover-preview to
 * be layered on top in a later step.
 */
export function PageRefView({ node, editor }: NodeViewProps) {
  const pageId = (node.attrs.pageId as string) || ""
  const title = (node.attrs.title as string) || "Untitled"

  function navigate() {
    const provider = getProvider(editor)
    provider?.onNavigate?.(pageId)
  }

  return (
    <NodeViewWrapper as="span" className="page-ref-wrap">
      <button
        type="button"
        className="page-ref"
        onClick={navigate}
        title={title}
      >
        <FileText size={12} className="page-ref-icon" />
        <span className="page-ref-title">{title}</span>
      </button>
    </NodeViewWrapper>
  )
}
