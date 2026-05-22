import type { ThemeId } from "@/components/theme-constants"
import { getSwatch, type MinimapColors, type Mode } from "./tokens"
import { getSelectionColor } from "./selection-color"


/**
 * Resolve all four Minimap colors for a Dim0 theme variant. The
 * viewport box reuses the selection color so the two chrome surfaces
 * stay visually paired.
 */
export const getMinimapColors = (themeId: ThemeId, mode: Mode): MinimapColors => {
  const [bg, primary, accent] = getSwatch(themeId, mode)
  return {
    viewportColor: getSelectionColor(themeId, mode),
    backgroundColor: bg,
    borderColor: accent,
    defaultNodeColor: primary,
  }
}
