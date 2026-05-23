import { useMemo } from "react"
import { useTheme } from "@/components/theme-provider"
import { useBoardAppStore } from "../store/board-app-store"
import { getBackground } from "./background"
import { getMinimapColors } from "./minimap-colors"
import { makeBoardThemeResolver } from "./resolver"
import { getSelectionColor } from "./selection-color"
import type { BoardThemeTokens } from "./tokens"


/**
 * Compose canvas-harness theming from the current Dim0 theme + per-board
 * localStorage overrides (background color + texture). Returns a
 * memoized `BoardThemeTokens` — feed straight to `<Canvas theme
 * selectionColor background />` and `<Minimap {...minimap}>`.
 *
 * Resolver identity is stable across renders of unchanged
 * (themeId, mode, boardBackground, boardBackgroundTexture); recreating
 * it would force `<Canvas>` to rebuild the renderer on every parent
 * re-render.
 */
export const useBoardTheme = (): BoardThemeTokens => {
  const { themeId, resolvedTheme } = useTheme()
  const boardBackground = useBoardAppStore((s) => s.boardBackground)
  const boardBackgroundTexture = useBoardAppStore((s) => s.boardBackgroundTexture)
  return useMemo<BoardThemeTokens>(
    () => ({
      resolver: makeBoardThemeResolver(themeId, resolvedTheme),
      selectionColor: getSelectionColor(themeId, resolvedTheme),
      minimap: getMinimapColors(themeId, resolvedTheme),
      background: getBackground({
        themeId,
        mode: resolvedTheme,
        boardBackground,
        boardBackgroundTexture,
      }),
    }),
    [themeId, resolvedTheme, boardBackground, boardBackgroundTexture],
  )
}
