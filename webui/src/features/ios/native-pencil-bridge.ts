import { z } from "zod"
import { useBoardAppStore } from "@/features/board/harness/store/board-app-store"


type NativePencilGestureDetail = {
  handled?: boolean
}


type NativeMessageHandler = {
  postMessage: (message: unknown) => void
}


declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        dim0NativePencil?: NativeMessageHandler
      }
    }
  }
}


const nativePencilStrokeSchema = z.object({
  kind: z.literal("dim0.native-pencil.stroke"),
  version: z.literal(1),
  sessionId: z.string().uuid(),
  contextId: z.string().min(1).max(500),
  stroke: z.object({
    id: z.string().regex(/^[a-f0-9]{64}$/i),
    tool: z.enum(["pen", "highlighter"]),
    color: z.string().regex(/^#[a-f0-9]{6}$/i),
    width: z.number().finite().min(0.5).max(64),
    opacity: z.number().finite().min(0).max(1),
    points: z.array(z.object({
      x: z.number().finite(),
      y: z.number().finite(),
      pressure: z.number().finite().min(0).max(1),
    }).strict()).min(1).max(50_000),
  }).strict(),
  handled: z.boolean().optional(),
}).strict()


export type NativePencilStroke = z.infer<typeof nativePencilStrokeSchema>


export type NativePencilConfiguration = {
  enabled: boolean
  contextId: string
  rect: { x: number; y: number; width: number; height: number }
  color: string
  storedColor: string
  width: number
}


/** Sends the current web canvas bounds and pen appearance to the native PencilKit overlay. */
export const configureNativePencil = (configuration: NativePencilConfiguration): boolean => {
  const handler = window.webkit?.messageHandlers?.dim0NativePencil
  if (!handler) return false

  handler.postMessage({
    kind: "dim0.native-pencil.configure",
    version: 1,
    ...configuration,
  })
  return true
}


/** Listens for completed native strokes and acknowledges only successful formal-node handoffs. */
export const subscribeNativePencilStrokes = (
  onStroke: (stroke: NativePencilStroke) => boolean,
): (() => void) => {
  const listener = (event: Event): void => {
    const customEvent = event as CustomEvent<unknown>
    const parsed = nativePencilStrokeSchema.safeParse(customEvent.detail)
    if (!parsed.success) return

    const sourceDetail = customEvent.detail as NativePencilGestureDetail
    sourceDetail.handled = onStroke(parsed.data)
  }

  window.addEventListener("dim0:native-pencil-stroke", listener)
  return () => window.removeEventListener("dim0:native-pencil-stroke", listener)
}


/** Routes native Pencil gestures into the active canvas tool without touching ink Pointer Events. */
export const initNativePencilBridge = (): (() => void) => {
  const onDoubleTap = (event: Event): void => {
    const customEvent = event as CustomEvent<NativePencilGestureDetail>
    if (customEvent.detail) customEvent.detail.handled = true

    const board = useBoardAppStore.getState()
    board.setTool(board.tool === "eraser" ? "ink" : "eraser")
  }

  window.addEventListener("dim0:native-pencil-double-tap", onDoubleTap)
  return () => window.removeEventListener("dim0:native-pencil-double-tap", onDoubleTap)
}
