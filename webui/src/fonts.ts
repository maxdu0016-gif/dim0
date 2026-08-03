/**
 * Self-hosted web fonts, bundled via `@fontsource` — replaces the Google Fonts
 * CDN `@import` that used to sit at the top of `index.css`. The app now carries
 * no third-party font dependency: it renders correctly fully offline (the whole
 * point of the desktop build), with no cold network fetch and no IP leak to
 * Google on every launch.
 *
 * The board canvas (canvas-harness) paints text with these families. In WebKit
 * (Safari and the Tauri WKWebView) drawing to a `<canvas>` does NOT trigger a
 * web font to load — only DOM usage does — so a canvas-only font silently falls
 * back to `cursive` (macOS Snell Roundhand) until something forces the load.
 * `preloadCanvasFonts` forces it; the harness repaints on the resulting
 * `document.fonts` `loadingdone`.
 */

// sans — Atkinson Hyperlegible Next (variable, normal + italic)
import "@fontsource-variable/atkinson-hyperlegible-next/wght.css"
import "@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css"
// serif — Lora (variable, normal + italic)
import "@fontsource-variable/lora/wght.css"
import "@fontsource-variable/lora/wght-italic.css"
// mono — Inconsolata (variable, normal only)
import "@fontsource-variable/inconsolata/wght.css"
// handwriting — Architects Daughter (static 400)
import "@fontsource/architects-daughter/400.css"
// informal — Shantell Sans (variable, normal + italic)
import "@fontsource-variable/shantell-sans/wght.css"
import "@fontsource-variable/shantell-sans/wght-italic.css"


/** Families canvas-harness paints on the board (its `FONT_FAMILY_MAP`). */
const CANVAS_FONT_FAMILIES = [
  "Architects Daughter",
  "Atkinson Hyperlegible Next",
  "Lora",
  "Inconsolata",
  "Shantell Sans",
] as const


/**
 * Force WebKit to actually download the canvas fonts. Canvas draws don't request
 * web fonts in WebKit, so without this the board keeps the `cursive` fallback
 * (the dark-vs-light discrepancy was really "which mode painted before the font
 * arrived"). Fire-and-forget — the harness repaints when `loadingdone` fires.
 */
export function preloadCanvasFonts(): void {
  if (typeof document === "undefined" || !("fonts" in document)) return
  for (const family of CANVAS_FONT_FAMILIES) {
    // normal + italic so styled nodes don't fall back either (a family without
    // an italic face simply resolves to nothing — harmless)
    document.fonts.load(`16px "${family}"`).catch(() => {})
    document.fonts.load(`italic 16px "${family}"`).catch(() => {})
  }
}
