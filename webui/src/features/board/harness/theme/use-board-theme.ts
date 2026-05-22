import { useMemo } from "react"
import { useTheme } from "@/components/theme-provider"
import { getBackground } from "./background"
import { getMinimapColors } from "./minimap-colors"
import { makeBoardThemeResolver } from "./resolver"
import { getSelectionColor } from "./selection-color"
import type { BoardThemeTokens } from "./tokens"


/**
 * Compose canvas-harness theming from the current Dim0 theme. Returns
 * a memoized `BoardThemeTokens` — feed it straight to `<Canvas theme
 * selectionColor background />` and `<Minimap {...minimap}>`.
 *
 * Resolver identity is stable across renders of unchanged
 * (themeId, mode); recreating it would force `<Canvas>` to rebuild
 * the renderer on every parent re-render.
 */
export const useBoardTheme = (): BoardThemeTokens => {
  const { themeId, resolvedTheme } = useTheme()
  return useMemo<BoardThemeTokens>(
    () => ({
      resolver: makeBoardThemeResolver(themeId, resolvedTheme),
      selectionColor: getSelectionColor(themeId, resolvedTheme),
      minimap: getMinimapColors(themeId, resolvedTheme),
      background: getBackground(themeId, resolvedTheme),
    }),
    [themeId, resolvedTheme],
  )
}
