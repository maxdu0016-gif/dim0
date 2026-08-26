import { describe, expect, it } from "vitest"
import { parseNativeSyncMessage } from "./wire"


const validSnapshot = {
  kind: "dim0.native-ink.snapshot",
  version: 1,
  sessionId: "ad7dbd1d-7235-49c9-854f-c00613504eae",
  revision: 2,
  strokes: [{
    id: "a".repeat(64),
    tool: "pen",
    color: "#1F1F24",
    width: 4,
    opacity: 1,
    points: [{ x: 1, y: 2, pressure: 0.5 }],
  }],
}


describe("parseNativeSyncMessage", () => {
  it("accepts the versioned ready and snapshot messages", () => {
    expect(parseNativeSyncMessage('{"kind":"dim0.native-ink.ready","version":1}')).toEqual({
      kind: "dim0.native-ink.ready",
      version: 1,
    })
    expect(parseNativeSyncMessage(JSON.stringify(validSnapshot))).toEqual(validSnapshot)
  })

  it("rejects malformed, future-version, and unsafe numeric messages", () => {
    expect(parseNativeSyncMessage("not json")).toBeNull()
    expect(parseNativeSyncMessage(JSON.stringify({ ...validSnapshot, version: 2 }))).toBeNull()
    expect(parseNativeSyncMessage(JSON.stringify({
      ...validSnapshot,
      strokes: [{
        ...validSnapshot.strokes[0],
        points: [{ x: 1, y: 2, pressure: Number.NaN }],
      }],
    }))).toBeNull()
  })
})
