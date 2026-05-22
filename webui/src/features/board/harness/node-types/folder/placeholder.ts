import type { Node, RenderEnv } from "@canvas-harness/core"


/**
 * Canvas placeholder for a folder node — rendered when zoomed out below
 * the React-view threshold. A flat folder silhouette (body + tab) in
 * theme colors. No text — at low zoom labels are unreadable; the shape
 * alone identifies the type.
 */
export const drawFolderPlaceholder = (
  ctx: CanvasRenderingContext2D,
  node: Node,
  env: RenderEnv,
): void => {
  const { w, h } = node
  const fill = (env.theme("backgroundColor") as string) ?? "#fde68a"
  const stroke = (env.theme("strokeColor") as string) ?? "#92400e"
  const tabW = Math.min(w * 0.35, 60)
  const tabH = Math.min(h * 0.18, 22)
  const radius = Math.min(6, w * 0.04, h * 0.04)

  ctx.save()
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.5

  // Folder body — rounded rect occupying the bottom 82% so the tab sits above.
  const bodyY = tabH
  ctx.beginPath()
  ctx.moveTo(radius, bodyY)
  ctx.lineTo(w - radius, bodyY)
  ctx.quadraticCurveTo(w, bodyY, w, bodyY + radius)
  ctx.lineTo(w, h - radius)
  ctx.quadraticCurveTo(w, h, w - radius, h)
  ctx.lineTo(radius, h)
  ctx.quadraticCurveTo(0, h, 0, h - radius)
  ctx.lineTo(0, bodyY + radius)
  ctx.quadraticCurveTo(0, bodyY, radius, bodyY)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Tab — small trapezoid on the top-left.
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(tabW - tabH * 0.4, 0)
  ctx.lineTo(tabW, tabH)
  ctx.lineTo(radius, tabH)
  ctx.quadraticCurveTo(0, tabH, 0, tabH - radius)
  ctx.lineTo(0, radius)
  ctx.quadraticCurveTo(0, 0, radius, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}
