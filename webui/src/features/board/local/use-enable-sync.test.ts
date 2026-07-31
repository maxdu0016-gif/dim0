import { describe, expect, it } from "vitest"
import { isPromotedBoardCurrentlyOpen } from "./use-enable-sync"


describe("isPromotedBoardCurrentlyOpen", () => {
  it("is true when the promoted board is the one open at /local/$id", () => {
    expect(isPromotedBoardCurrentlyOpen("/local/board-1", "board-1")).toBe(true)
  })

  it("is false when viewing a different local board (promoted from the sidebar)", () => {
    expect(isPromotedBoardCurrentlyOpen("/local/board-2", "board-1")).toBe(false)
  })

  it("is false when not on a board route (e.g. the dashboard)", () => {
    expect(isPromotedBoardCurrentlyOpen("/", "board-1")).toBe(false)
    expect(isPromotedBoardCurrentlyOpen("/local", "board-1")).toBe(false)
  })

  it("is false when the board is already open on the synced route", () => {
    // Already synced → the local route no longer matches, so no re-navigate.
    expect(isPromotedBoardCurrentlyOpen("/boards/board-1", "board-1")).toBe(false)
  })

  it("does not match a board id that is only a path prefix", () => {
    expect(isPromotedBoardCurrentlyOpen("/local/board-1/extra", "board-1")).toBe(false)
  })
})
