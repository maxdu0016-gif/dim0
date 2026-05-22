import { defineNode } from "@canvas-harness/core"
import { drawCodeSandboxPlaceholder } from "./placeholder"


/**
 * Code-sandbox node — runnable code in a Daytona-backed sandbox. The
 * inline view shows a title + language + code preview only; the full
 * editor opens in a modal surface (phase 5 wires that flow via
 * board-app-store.activeNodeSurface).
 */
export const codeSandboxDef = defineNode({
  type: "code-sandbox",
  drawPlaceholder: drawCodeSandboxPlaceholder,
  lod: { minZoomForReact: 0.5, minZoomForPlaceholder: 0.2 },
  hitTest: (node, p) => p.x >= 0 && p.x <= node.w && p.y >= 0 && p.y <= node.h,
})
