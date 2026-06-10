import { defineNode } from "@canvas-harness/core"

import { drawMiniAppPlaceholder } from "./placeholder"
import { MiniAppView } from "./view"


/**
 * Mini-app node — sandboxed-iframe-rendered React component.
 *
 * Like the HTML widget, the iframe is expensive to mount; we share the
 * same LOD threshold (0.6) so iframes only render when the user has
 * zoomed in. Below that, the canvas placeholder paint runs in its
 * place — see drawMiniAppPlaceholder.
 */
export const miniAppDef = defineNode({
  type: "mini-app",
  view: MiniAppView,
  drawPlaceholder: drawMiniAppPlaceholder,
  lod: { minZoomForReact: 0.6, minZoomForPlaceholder: 0.05 },
  hitTest: (node, p) => p.x >= 0 && p.x <= node.w && p.y >= 0 && p.y <= node.h,
})
