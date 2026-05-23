/**
 * Read a CSS custom property from `:root`. Returns the trimmed
 * computed value (resolved at call time) or `""` if the property is
 * unset or we're outside a browser context.
 *
 * Used by the theme adapter to pull `--background`, `--muted`,
 * `--muted-foreground`, etc. at runtime so canvas-harness paints the
 * exact same colors the rest of the app uses.
 */
export const readCssVar = (name: string): string => {
  if (typeof window === "undefined") return ""
  return window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
}
