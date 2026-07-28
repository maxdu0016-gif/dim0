import { describe, expect, it } from "vitest"
import type { BoardMeta } from "@/features/board/model"
import type { BoardListItem } from "@/features/board/api/list-boards"
import { partitionBoards } from "./partition-boards"


const local = (id: string, createdAt: number, kind: BoardMeta["kind"] = "local-only"): BoardMeta => ({
  id,
  title: id,
  kind,
  visibility: "private",
  createdAt,
  updatedAt: createdAt,
})


const synced = (uid: string, createdAt: string): BoardListItem => ({
  uid,
  type: "graph",
  readonly: false,
  visibility: "private",
  createdAt,
  role: "owner",
})


describe("partitionBoards", () => {
  it("puts every local board on-device when synced is undefined (signed out)", () => {
    const { onDevice, synced: syncedOut } = partitionBoards(
      [local("a", 1), local("b", 2)],
      undefined,
    )
    expect(onDevice.map((b) => b.id)).toEqual(["b", "a"])
    expect(syncedOut).toEqual([])
  })

  it("dedupes: a board in both lists shows only under synced (keyed by id)", () => {
    const { onDevice, synced: syncedOut } = partitionBoards(
      [local("a", 1), local("shared", 2, "synced")],
      [synced("shared", "2024-01-01T00:00:00Z")],
    )
    expect(onDevice.map((b) => b.id)).toEqual(["a"])
    expect(syncedOut.map((b) => b.uid)).toEqual(["shared"])
  })

  it("keeps a promoted (kind=synced) replica off-device even when signed out", () => {
    // Logout clears the remote list; the leftover synced replica must NOT
    // resurface under "on device" — it belongs to a user account.
    const { onDevice } = partitionBoards(
      [local("a", 1), local("promoted", 2, "synced")],
      undefined,
    )
    expect(onDevice.map((b) => b.id)).toEqual(["a"])
  })

  it("drops a local-only board already in the synced list (kind flip not yet landed)", () => {
    // Backend adopted the board but the local kind flip hasn't committed;
    // the id/uid match must still keep it out of on-device (no transient double).
    const { onDevice } = partitionBoards(
      [local("pending", 1, "local-only")],
      [synced("pending", "2024-01-01T00:00:00Z")],
    )
    expect(onDevice).toEqual([])
  })

  it("sorts each group newest first (local by epoch ms, synced by ISO date)", () => {
    const { onDevice, synced: syncedOut } = partitionBoards(
      [local("old", 100), local("new", 200)],
      [synced("s-old", "2023-01-01T00:00:00Z"), synced("s-new", "2025-01-01T00:00:00Z")],
    )
    expect(onDevice.map((b) => b.id)).toEqual(["new", "old"])
    expect(syncedOut.map((b) => b.uid)).toEqual(["s-new", "s-old"])
  })

  it("handles both empty", () => {
    expect(partitionBoards([], [])).toEqual({ onDevice: [], synced: [] })
  })
})
