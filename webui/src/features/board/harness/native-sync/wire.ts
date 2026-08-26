import { z } from "zod"


const MAX_MESSAGE_BYTES = 20 * 1024 * 1024

const nativeInkPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  pressure: z.number().finite().min(0).max(1),
}).strict()

const nativeInkStrokeSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/i),
  tool: z.enum(["pen", "highlighter"]),
  color: z.string().regex(/^#[a-f0-9]{6}$/i),
  width: z.number().finite().min(0.5).max(64),
  opacity: z.number().finite().min(0).max(1),
  points: z.array(nativeInkPointSchema).min(1).max(50_000),
}).strict()

export const nativeInkSnapshotSchema = z.object({
  kind: z.literal("dim0.native-ink.snapshot"),
  version: z.literal(1),
  sessionId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  strokes: z.array(nativeInkStrokeSchema).max(20_000),
}).strict()

const nativeInkReadySchema = z.object({
  kind: z.literal("dim0.native-ink.ready"),
  version: z.literal(1),
}).strict()

export type NativeInkSnapshot = z.infer<typeof nativeInkSnapshotSchema>
export type NativeInkStroke = NativeInkSnapshot["strokes"][number]
export type NativeSyncMessage = NativeInkSnapshot | z.infer<typeof nativeInkReadySchema>


/** Parse an untrusted LAN message without letting malformed payloads reach the board store. */
export const parseNativeSyncMessage = (raw: string): NativeSyncMessage | null => {
  if (raw.length === 0 || raw.length > MAX_MESSAGE_BYTES) return null

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }

  const ready = nativeInkReadySchema.safeParse(value)
  if (ready.success) return ready.data

  const snapshot = nativeInkSnapshotSchema.safeParse(value)
  return snapshot.success ? snapshot.data : null
}
