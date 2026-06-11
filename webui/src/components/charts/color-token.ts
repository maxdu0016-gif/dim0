// Resolve a color string into a CSS-usable value.
//
// Tokens that match the shadcn theme set in webui/src/index.css are rewritten
// to `var(--color-X)` so they auto-adapt to light/dark mode. Anything else
// (hex, rgb, hsl, named CSS color) passes through unchanged.
//
// Shared by <chart> and <graph>.


const TOKEN_NAMES: ReadonlySet<string> = new Set([
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "destructive",
  "destructive-foreground",
  "accent",
  "accent-foreground",
  "muted",
  "muted-foreground",
  "foreground",
  "background",
  "border",
  "card",
  "card-foreground",
])


export function resolveColor(input: string | undefined): string {
  if (input == null || input === "") return defaultPaletteColor(0)
  return TOKEN_NAMES.has(input) ? `var(--color-${input})` : input
}


// Rotates through the five chart tokens so multiple datasets without an
// explicit color get a consistent palette.
export function defaultPaletteColor(index: number): string {
  return `var(--color-chart-${(index % 5) + 1})`
}
