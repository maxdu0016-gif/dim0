import { defineNode } from "@canvas-harness/core"
import { drawFolderPlaceholder } from "./placeholder"


/**
 * Folder node — nested-board entry point. Phase 4 wires double-click on
 * a folder node to router navigation; the view here only renders the
 * card. The placeholder paints at low zoom (≤ minZoomForReact).
 */
export const folderDef = defineNode({
  type: "folder",
  drawPlaceholder: drawFolderPlaceholder,
  lod: { minZoomForReact: 0.4, minZoomForPlaceholder: 0.15 },
  hitTest: (node, p) => p.x >= 0 && p.x <= node.w && p.y >= 0 && p.y <= node.h,
})
