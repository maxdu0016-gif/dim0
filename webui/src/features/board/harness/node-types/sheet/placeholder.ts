import type { Node, RenderEnv } from "@canvas-harness/core"


/**
 * Sheet placeholder — lined-paper card. A title stripe at top + evenly
 * spaced horizontal lines below suggest a long-form text document
 * without rendering any content.
 */
export const drawSheetPlaceholder = (
  ctx: CanvasRenderingContext2D,
  node: Node,
  env: RenderEnv,
): void => {
  const { w, h } = node
  const fill = (env.theme("backgroundColor") as string) ?? "#fefce8"
  const stroke = (env.theme("strokeColor") as string) ?? "#a16207"
  const titleH = Math.min(h * 0.14, 22)

  ctx.save()
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1
  ctx.fillRect(0, 0, w, h)
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  // Title stripe — thicker line near the top.
  ctx.beginPath()
  ctx.lineWidth = 2
  const titleY = titleH * 0.55
  ctx.moveTo(12, titleY)
  ctx.lineTo(Math.min(w - 12, w * 0.5), titleY)
  ctx.stroke()

  // Body lines — lined-paper effect.
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.35
  const lineSpacing = 12
  const startY = titleH + 8
  for (let y = startY; y < h - 6; y += lineSpacing) {
    ctx.beginPath()
    ctx.moveTo(12, y)
    ctx.lineTo(w - 12, y)
    ctx.stroke()
  }
  ctx.restore()
}
