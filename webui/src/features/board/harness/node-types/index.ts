import { documentDef } from "./document"
import { folderDef } from "./folder"
import type { BoardNodeTypeDef } from "../store/create-board-store"


/**
 * Array of all custom node defs registered with the board's
 * canvas-harness store. Pass directly to `createBoardStore({ nodeTypes })`.
 */
export const boardNodeTypes: ReadonlyArray<BoardNodeTypeDef> = [folderDef, documentDef]


export { documentDef, DocumentView } from "./document"
export { folderDef, FolderView } from "./folder"
export { useRenderCustomNodeView } from "./render-view"
