import { createHighlighter, type Highlighter } from "shiki"

export const LANGUAGE_OPTIONS = [
  { value: "plaintext", label: "Plain text" },
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "tsx", label: "TSX" },
  { value: "jsx", label: "JSX" },
  { value: "python", label: "Python" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "scss", label: "SCSS" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "toml", label: "TOML" },
  { value: "markdown", label: "Markdown" },
  { value: "bash", label: "Bash" },
  { value: "sql", label: "SQL" },
  { value: "graphql", label: "GraphQL" },
  { value: "diff", label: "Diff" },
] as const

export type LangValue = (typeof LANGUAGE_OPTIONS)[number]["value"]

let _promise: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  if (!_promise) {
    _promise = createHighlighter({
      themes: ["rose-pine", "rose-pine-dawn"],
      langs: LANGUAGE_OPTIONS.map((o) => o.value),
    })
  }
  return _promise
}

/** Returns the full Shiki HTML string (pre + code) with dual light/dark theme vars. */
export async function highlightCode(code: string, lang: string): Promise<string> {
  const hl = await getHighlighter()
  const safeLang = hl.getLoadedLanguages().includes(lang as LangValue) ? lang : "plaintext"
  return hl.codeToHtml(code, {
    lang: safeLang,
    themes: { light: "rose-pine-dawn", dark: "rose-pine" },
    defaultColor: false,
  })
}
