import type { Schema } from "hast-util-sanitize"
import { defaultSchema } from "rehype-sanitize"


// MathML elements emitted by rehype-katex for the accessible (screen-reader)
// math tree. Allowlisted so KaTeX output survives sanitization.
const MATHML_TAGS = [
  "math", "semantics", "annotation", "mrow", "mi", "mo", "mn", "ms", "mtext",
  "mspace", "mfrac", "mroot", "msqrt", "msup", "msub", "msubsup", "mover",
  "munder", "munderover", "mtable", "mtr", "mtd", "mlabeledtr", "mpadded",
  "mphantom", "menclose", "mstyle", "mglyph", "merror", "maction",
]


// SVG elements KaTeX emits for stretchy delimiters, sqrt rules and arrows.
const SVG_TAGS = ["svg", "path", "line", "g", "rect", "defs", "use"]


// Inert geometric / presentational attributes used by KaTeX's MathML and SVG
// output. None are script-bearing; event-handler and URL attributes are
// intentionally excluded so the sanitizer still strips them.
const MATH_SVG_ATTRS = [
  "className", "style", "ariaHidden", "xmlns", "encoding", "mathvariant",
  "displaystyle", "scriptlevel", "stretchy", "fence", "accent", "accentunder",
  "columnalign", "columnspacing", "rowalign", "rowspacing", "linethickness",
  "lspace", "rspace", "voffset", "width", "height", "depth", "minsize",
  "maxsize", "mathcolor", "mathbackground", "notation", "separator", "form",
  "largeop", "movablelimits", "symmetric", "viewBox", "preserveAspectRatio",
  "d", "fill", "stroke", "strokeWidth", "transform", "x", "y", "x1", "y1",
  "x2", "y2", "points",
]


/**
 * Sanitization schema for the markdown viewer.
 *
 * Extends hast-util-sanitize's GitHub-style `defaultSchema` so raw HTML parsed
 * by rehype-raw is stripped of script/handler/URL-based XSS vectors while the
 * viewer's intended rich output keeps rendering: KaTeX math (rehype-katex's
 * MathML + styled HTML spans), highlight `<mark>` chips, `#tag` `<span>` chips,
 * `<details>`/`<summary>` toggles and `page://` reference links.
 */
export const SANITIZE_SCHEMA: Schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "mark", ...MATHML_TAGS, ...SVG_TAGS],
  attributes: {
    ...defaultSchema.attributes,
    // Highlight marks carry a validated color: `data-color` themes the named
    // palette, an inline `style` themes custom hex values (see remark-highlight).
    mark: ["dataColor", "style"],
    // KaTeX HTML spans and `#tag` chips rely on class names + inline layout
    // styles; `aria-hidden` marks KaTeX's visual (non-AT) subtree.
    span: ["className", "style", "ariaHidden"],
    ...Object.fromEntries([...MATHML_TAGS, ...SVG_TAGS].map((tag) => [tag, MATH_SVG_ATTRS])),
  },
  protocols: {
    ...defaultSchema.protocols,
    // `page://<id>` links render as inline PageRefChips, never real anchors.
    href: [...(defaultSchema.protocols?.href ?? []), "page"],
  },
}
