import type { CanvasBackground } from "@canvas-harness/core"
import type { ThemeId } from "@/components/theme-constants"
import { getSwatch, type Mode } from "./tokens"


/**
 * Resolve the canvas page background for a Dim0 theme variant.
 *
 * Pattern stays `'none'` for v1 — paper textures are tracked as an
 * open question in migration-canvas-harness.md §12 (may need lib
 * extension). `patternColor` and `gap` are configured so flipping
 * pattern to `'dots'` or `'grid'` produces a sensible look without
 * further tuning.
 */
export const getBackground = (themeId: ThemeId, mode: Mode): CanvasBackground => {
  const [bg, , accent] = getSwatch(themeId, mode)
  return {
    color: bg,
    pattern: "none",
    patternColor: accent,
    gap: 24,
    minZoom: 0.4,
  }
}
