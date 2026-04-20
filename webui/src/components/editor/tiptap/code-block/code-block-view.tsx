import { useState, useEffect } from "react"
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react"
import type { NodeViewProps } from "@tiptap/react"
import { CopySimple, Check, CaretDown } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { highlightCode, LANGUAGE_OPTIONS } from "./shiki"


export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const code = node.textContent
  const lang = (node.attrs.language as string | null) ?? "plaintext"

  useEffect(() => {
    let cancelled = false
    highlightCode(code, lang).then((html) => {
      if (!cancelled) setHighlighted(html)
    })
    return () => { cancelled = true }
  }, [code, lang])

  function copyCode() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <NodeViewWrapper as="div" className="code-block-node">

      {/* ── header ──────────────────────────────────────────── */}
      <div className="code-block-header" contentEditable={false}>

        <div className="code-block-lang-wrap">
          <select
            value={lang}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => updateAttributes({ language: e.target.value })}
            className="code-block-lang-select"
          >
            {LANGUAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <CaretDown size={10} className="code-block-lang-caret" />
        </div>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={copyCode}
          className="code-block-copy-btn"
          title={copied ? "Copied!" : "Copy code"}
        >
          {copied
            ? <Check size={13} weight="bold" className="text-green-500" />
            : <CopySimple size={13} />}
        </button>

      </div>

      {/* ── body: Shiki overlay + transparent editable layer ── */}
      <div className="code-block-body">

        {/* Shiki highlighted backdrop (non-interactive) */}
        {highlighted !== null && (
          <div
            className="code-block-shiki-layer"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        )}

        {/* Editable ProseMirror content — transparent once Shiki is ready */}
        <pre className={cn("code-block-edit-pre", highlighted !== null && "shiki-loaded")}>
          <NodeViewContent as="code" className="code-block-editable" />
        </pre>

      </div>
    </NodeViewWrapper>
  )
}
