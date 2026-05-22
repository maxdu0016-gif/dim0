import { asGroupId, asNodeId } from "@canvas-harness/core"
import type { Node } from "@canvas-harness/core"
import type { Note, NoteProperties, RichText } from "@/features/board/types/note"
import type { Document } from "@/features/board/types/document"
import { dim0StyleToCanvas } from "./style"


const DEG_TO_RAD = Math.PI / 180


/**
 * Payload on `Node.data` that holds every Dim0 Note field which doesn't
 * lift onto a canvas-harness Node primitive. Round-trip integrity
 * depends on these being preserved.
 */
export type NoteNodeData = {
  noteType: "note" | "document"
  version: number
  createdAt?: string
  updatedAt?: string
  deletedAt?: string
  graphUid: string
  parentId?: string
  minWidth?: number
  minHeight?: number
  roughSeed?: number
  /** Title / display name. Used by breadcrumbs, sheet headers, folder names, list cards. */
  label?: RichText
  /** All Note properties except the ones lifted to Node primitives. */
  properties: Partial<NoteProperties>
}


/** Convert a Dim0 Note (or Document) to a canvas-harness Node. */
export const noteToNode = (note: Note | Document): Node => {
  const pos = note.properties?.nodePosition?.position ?? { x: 0, y: 0 }
  const size = note.properties?.nodeSize?.size ?? { width: 320, height: 180 }
  const z = note.properties?.nodeZIndex?.number ?? 0

  const rest: Partial<NoteProperties> = { ...note.properties }
  delete (rest as Record<string, unknown>).nodePosition
  delete (rest as Record<string, unknown>).nodeSize
  delete (rest as Record<string, unknown>).nodeZIndex

  const data: NoteNodeData = {
    noteType: note.type,
    version: note.version,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    deletedAt: note.deletedAt,
    graphUid: note.graphUid,
    parentId: note.parentId,
    minWidth: note.minWidth,
    minHeight: note.minHeight,
    roughSeed: note.roughSeed,
    label: note.label,
    properties: rest,
  }

  // Inline text on a shape lives in note.content.markdown — note.label is the
  // title (breadcrumbs / folder name / sheet header) and rides on data.label.
  // Older notes with text stored on label fall through to keep them visible.
  const body = note.content?.markdown ?? note.label?.markdown ?? ""

  return {
    id: asNodeId(note.id),
    type: note.style.type,
    x: pos.x,
    y: pos.y,
    w: size.width,
    h: size.height,
    angle: (note.style.angle ?? 0) * DEG_TO_RAD,
    z,
    groups: (note.style.groupIds ?? []).map(asGroupId),
    content: body,
    style: dim0StyleToCanvas(note.style),
    data,
  }
}
