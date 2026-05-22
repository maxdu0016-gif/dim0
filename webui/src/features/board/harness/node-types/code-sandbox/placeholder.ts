import type { Node, RenderEnv } from "@canvas-harness/core"


/**
 * Code-sandbox placeholder — dark-toned card with horizontal "lines of
 * code" strokes of varying widths. No real syntax highlighting, just
 * enough visual texture that the shape reads as a code block.
 */
export const drawCodeSandboxPlaceholder = (
  ctx: CanvasRenderingContext2D,
  node: Node,
  env: RenderEnv,
): void => {
  const { w, h } = node
  const fill = (env.theme("backgroundColor") as string) ?? "#1f2937"
  const stroke = (env.theme("strokeColor") as string) ?? "#9ca3af"
  const titleH = Math.min(h * 0.15, 24)

  ctx.save()
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1
  ctx.fillRect(0, 0, w, h)
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  // Title-bar divider.
  ctx.beginPath()
  ctx.moveTo(0, titleH)
  ctx.lineTo(w, titleH)
  ctx.stroke()

  // Pseudo-code strokes — alternating widths suggest indented lines.
  const lineH = 8
  const startY = titleH + 8
  const padX = 8
  const widths = [0.6, 0.45, 0.7, 0.3, 0.55, 0.65, 0.4, 0.5, 0.7, 0.35]
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 2
  for (let i = 0; i < widths.length; i += 1) {
    const y = startY + i * lineH
    if (y > h - 6) break
    const lineW = (w - padX * 2) * widths[i]
    const indent = i % 3 === 1 ? 10 : 0
    ctx.beginPath()
    ctx.moveTo(padX + indent, y)
    ctx.lineTo(padX + indent + lineW, y)
    ctx.stroke()
  }
  ctx.restore()
}
