import { useCallback } from "react"
import type { CanvasStore } from "@canvas-harness/core"
import type { CanvasCreateDragEvent, CanvasPointerEvent } from "@canvas-harness/react"
import { createDefaultNote } from "@/features/board/types/note"
import { canvasTypeToDim0 } from "../convert/node-type"
import { noteToNode } from "../convert/note-to-node"


/** Tools that materialize a new node on drag-to-create / click-to-create. */
const SHAPE_TOOLS = new Set([
  "rect",
  "ellipse",
  "diamond",
  "tag",
  "capsule",
  "thought-cloud",
  "layered-rect",
  "layered-ellipse",
  "layered-diamond",
  "soft-diamond",
  "text",
  "frame",
  // Custom node types — go through the same convert + addNode path
  // (createDefaultNote handles their default sizes / styles per type).
  "folder",
  "sheet",
  "code-sandbox",
  "widget",
])


const isShapeTool = (tool: string): boolean => SHAPE_TOOLS.has(tool)


/**
 * onCreateDrag / onClick handlers for `<Canvas>`. Routes shape-tool
 * gestures into the conversion layer:
 *
 *   1. Build a fresh Dim0 Note via `createDefaultNote` so it carries
 *      the right default style + properties for round-trip persistence.
 *   2. Override its `nodePosition` / `nodeSize` from the gesture rect
 *      (drag) or the world click (click + default size).
 *   3. Convert to a canvas-harness Node and add it to the store.
 *
 * Select, pan, and arrow tools are handled by the lib internally — we
 * skip them here.
 */
export const useCreateHandlers = (
  store: CanvasStore,
  boardId: string | null,
): {
  handleCreateDrag: (e: CanvasCreateDragEvent) => void
  handleClick: (e: CanvasPointerEvent) => void
} => {
  const handleCreateDrag = useCallback(
    (e: CanvasCreateDragEvent): void => {
      if (!isShapeTool(e.tool)) return
      const dim0Type = canvasTypeToDim0(e.tool)
      const note = createDefaultNote({ boardId: boardId ?? "", nodeType: dim0Type })
      note.properties.nodePosition = {
        type: "position",
        position: { x: e.rect.x, y: e.rect.y },
      }
      note.properties.nodeSize = {
        type: "size",
        size: { width: e.rect.w, height: e.rect.h },
      }
      store.addNode(noteToNode(note))
    },
    [store, boardId],
  )

  const handleClick = useCallback(
    (e: CanvasPointerEvent): void => {
      if (!isShapeTool(e.tool)) return
      const dim0Type = canvasTypeToDim0(e.tool)
      const note = createDefaultNote({ boardId: boardId ?? "", nodeType: dim0Type })
      const size = note.properties.nodeSize.size ?? { width: 200, height: 120 }
      const { width, height } = size
      note.properties.nodePosition = {
        type: "position",
        position: { x: e.world.x - width / 2, y: e.world.y - height / 2 },
      }
      store.addNode(noteToNode(note))
    },
    [store, boardId],
  )

  return { handleCreateDrag, handleClick }
}
