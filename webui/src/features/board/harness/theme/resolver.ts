import type { ThemeResolver } from "@canvas-harness/react"
import type { ThemeId } from "@/components/theme-constants"
import { getSwatch, type Mode } from "./tokens"


/**
 * Build a canvas-harness ThemeResolver for a Dim0 theme variant.
 *
 * Resolves the five fallback tokens canvas-harness asks for —
 * `strokeColor`, `backgroundColor`, `textColor`, `edge.strokeColor`,
 * `edge.label.background` — from the theme's swatch trio (bg, primary,
 * accent). Per-node `style.*` always wins; this only fills gaps for
 * nodes/edges without an explicit color set.
 */
export const makeBoardThemeResolver = (themeId: ThemeId, mode: Mode): ThemeResolver => {
  const [bg, primary, accent] = getSwatch(themeId, mode)
  const tokens: Record<string, string> = {
    strokeColor: primary,
    backgroundColor: accent,
    textColor: primary,
    "edge.strokeColor": primary,
    "edge.label.background": bg,
  }
  return (token) => tokens[token]
}
