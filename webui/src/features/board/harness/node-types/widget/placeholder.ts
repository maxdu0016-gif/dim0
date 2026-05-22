import type { Node, RenderEnv } from "@canvas-harness/core"


/**
 * Widget placeholder — framed card with a title bar at top and a faded
 * grid pattern below. Signals "interactive embed" without rendering
 * the iframe (which is expensive and only visible above the React-LOD
 * threshold).
 */
export const drawWidgetPlaceholder = (
  ctx: CanvasRenderingContext2D,
  node: Node,
  env: RenderEnv,
): void => {
  const { w, h } = node
  const fill = (env.theme("backgroundColor") as string) ?? "#f3f4f6"
  const stroke = (env.theme("strokeColor") as string) ?? "#374151"
  const titleH = Math.min(h * 0.15, 24)

  ctx.save()
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.5
  ctx.fillRect(0, 0, w, h)
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  // Title bar divider.
  ctx.beginPath()
  ctx.moveTo(0, titleH)
  ctx.lineTo(w, titleH)
  ctx.stroke()

  // Faded grid inside the content area.
  ctx.globalAlpha = 0.2
  const cell = 16
  for (let x = cell; x < w; x += cell) {
    ctx.beginPath()
    ctx.moveTo(x, titleH)
    ctx.lineTo(x, h)
    ctx.stroke()
  }
  for (let y = titleH + cell; y < h; y += cell) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  ctx.restore()
}
