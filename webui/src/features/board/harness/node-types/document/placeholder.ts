import type { Node, RenderEnv } from "@canvas-harness/core"


/**
 * Document placeholder — page outline with a folded top-right corner.
 * No text at low zoom; the shape alone identifies the type.
 */
export const drawDocumentPlaceholder = (
  ctx: CanvasRenderingContext2D,
  node: Node,
  env: RenderEnv,
): void => {
  const { w, h } = node
  const fill = (env.theme("backgroundColor") as string) ?? "#fef3c7"
  const stroke = (env.theme("strokeColor") as string) ?? "#92400e"
  const fold = Math.min(w * 0.18, 24)

  ctx.save()
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.5

  // Page body — top-right corner cut off.
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(w - fold, 0)
  ctx.lineTo(w, fold)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Folded corner — small triangle in the inverse direction.
  ctx.beginPath()
  ctx.moveTo(w - fold, 0)
  ctx.lineTo(w - fold, fold)
  ctx.lineTo(w, fold)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}
