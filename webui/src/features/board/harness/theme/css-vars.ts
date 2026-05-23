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


/**
 * Read a CSS custom property mixed with transparency via `color-mix`.
 * `percent` is the source color's strength (0–100). 100 = opaque,
 * 0 = fully transparent.
 *
 * Uses a hidden DOM probe so the browser handles the mix natively —
 * works for any CSS color format (oklch, rgb, hex) the var resolves
 * to. Returns `""` outside a browser context.
 */
export const readCssVarMixed = (name: string, percent: number): string => {
  if (typeof window === "undefined") return ""
  const probe = document.createElement("div")
  probe.style.position = "absolute"
  probe.style.visibility = "hidden"
  probe.style.color = `color-mix(in oklch, var(${name}) ${percent}%, transparent)`
  document.body.appendChild(probe)
  const resolved = window.getComputedStyle(probe).color
  document.body.removeChild(probe)
  return resolved
}
