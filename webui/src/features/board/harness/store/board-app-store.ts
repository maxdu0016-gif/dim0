import { create } from "zustand"
import {
  type BoardBackgroundTexture,
  clearBoardBackground as persistClearBoardBackground,
  clearBoardBackgroundTexture as persistClearBoardBackgroundTexture,
  getBoardBackground,
  getBoardBackgroundTexture,
  setBoardBackground as persistSetBoardBackground,
  setBoardBackgroundTexture as persistSetBoardBackgroundTexture,
} from "@/features/board/utils/board-background"


export type NodeSurfaceKind = "sheet" | "code-sandbox" | "widget"


export type OpenNodeSurface = {
  nodeId: string
  kind: NodeSurfaceKind
}


/**
 * App-level state for the board feature. Owns everything the
 * canvas-harness store doesn't — page-level UI toggles, surface
 * panels, folder navigation, board metadata, background theming.
 *
 * Scene state (nodes / edges / camera / selection / interaction /
 * history) lives in the canvas-harness store; do not mirror it here.
 */
export type BoardAppState = {
  // Scope — which board the canvas is currently showing.
  boardId: string | null
  rootId: string | null

  // Board-level metadata (display only — not in scene history).
  boardLabel: string
  boardVisibility: "private" | "public" | null
  canEdit: boolean
  isLoading: boolean

  // UI toggles.
  viewSlides: boolean
  presentationMode: boolean

  // Folder navigation (per-board depth, reset on scope change).
  currentFolderDepth: number
  maxFolderDepth: number

  // Background (persisted per-board to localStorage).
  boardBackground: string | null
  boardBackgroundTexture: BoardBackgroundTexture | null

  // Modal surface for sheet / code-sandbox / widget nodes.
  activeNodeSurface: OpenNodeSurface | null
}


export type BoardAppActions = {
  /** Set boardId + rootId and reset per-board state (depth, surface, background). */
  setBoardScope: (scope: { boardId?: string | null; rootId?: string | null }) => void

  setBoardLabel: (label: string) => void
  setBoardVisibility: (visibility: BoardAppState["boardVisibility"]) => void
  setCanEdit: (canEdit: boolean) => void
  setIsLoading: (loading: boolean) => void

  setViewSlides: (enabled: boolean) => void
  setPresentationMode: (enabled: boolean) => void

  setCurrentFolderDepth: (depth: number) => void
  setMaxFolderDepth: (depth: number) => void

  setBoardBackground: (color: string | null) => void
  setBoardBackgroundTexture: (texture: BoardBackgroundTexture | null) => void

  openNodeSurface: (nodeId: string, kind: NodeSurfaceKind) => void
  closeNodeSurface: () => void
}


const initialState: BoardAppState = {
  boardId: null,
  rootId: null,
  boardLabel: "",
  boardVisibility: null,
  canEdit: true,
  isLoading: false,
  viewSlides: true,
  presentationMode: false,
  currentFolderDepth: -1,
  maxFolderDepth: 0,
  boardBackground: null,
  boardBackgroundTexture: null,
  activeNodeSurface: null,
}


export const useBoardAppStore = create<BoardAppState & BoardAppActions>((set) => ({
  ...initialState,

  setBoardScope: ({ boardId = null, rootId = null }) =>
    set({
      boardId,
      rootId,
      boardLabel: "",
      boardVisibility: null,
      canEdit: true,
      isLoading: false,
      currentFolderDepth: -1,
      maxFolderDepth: 0,
      presentationMode: false,
      activeNodeSurface: null,
      boardBackground: boardId ? getBoardBackground(boardId) : null,
      boardBackgroundTexture: boardId ? getBoardBackgroundTexture(boardId) : null,
    }),

  setBoardLabel: (label) => set({ boardLabel: label }),
  setBoardVisibility: (visibility) => set({ boardVisibility: visibility }),
  setCanEdit: (canEdit) => set({ canEdit }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  setViewSlides: (enabled) => set({ viewSlides: enabled }),
  setPresentationMode: (enabled) => set({ presentationMode: enabled }),

  setCurrentFolderDepth: (depth) => set({ currentFolderDepth: Math.max(-1, Math.floor(depth)) }),
  setMaxFolderDepth: (depth) => set({ maxFolderDepth: Math.max(0, Math.floor(depth)) }),

  setBoardBackground: (color) =>
    set((state) => {
      const id = state.boardId ?? undefined
      if (color === null) persistClearBoardBackground(id)
      else persistSetBoardBackground(id, color)
      return { boardBackground: color }
    }),

  setBoardBackgroundTexture: (texture) =>
    set((state) => {
      const id = state.boardId ?? undefined
      if (texture === null) persistClearBoardBackgroundTexture(id)
      else persistSetBoardBackgroundTexture(id, texture)
      return { boardBackgroundTexture: texture }
    }),

  openNodeSurface: (nodeId, kind) => set({ activeNodeSurface: { nodeId, kind } }),
  closeNodeSurface: () => set({ activeNodeSurface: null }),
}))
