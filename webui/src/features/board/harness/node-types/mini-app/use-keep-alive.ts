import { useEffect, useRef } from "react"
import { create } from "zustand"


// Max mini-app iframes retained after they stop being active (settled in view).
// Bounds the kept-alive iframes — and their event loops — on boards with many
// mini-apps. The caller (MiniAppView) separately guarantees a genuinely-visible
// node is never unmounted, so this cap only limits OFF-SCREEN retention.
const CAP = 8


type KeepAliveState = {
  live: string[]
  touch: (id: string) => void
  release: (id: string) => void
}


/**
 * Module-wide LRU of retained mini-app iframes (MRU first). `touch` promotes a
 * node and evicts the least-recently-active beyond CAP; `release` drops a node
 * removed from the board entirely.
 */
const useKeepAliveStore = create<KeepAliveState>((set) => ({
  live: [],
  touch: (id) =>
    set((s) => {
      const next = [id, ...s.live.filter((x) => x !== id)]
      return { live: next.length > CAP ? next.slice(0, CAP) : next }
    }),
  release: (id) => set((s) => ({ live: s.live.filter((x) => x !== id) })),
}))


/**
 * Whether a mini-app node is in the retained (kept-alive) set. `active` means the
 * node has settled in view (see `useSettledInView` / `MOUNT_SETTLE_MS`) — a fast
 * fly-by never becomes active, so it never enters the set and its iframe never
 * boots. Recency is stamped on active-enter AND active-exit, so the node the user
 * just left is most-recently-used (survives eviction longest); a node never
 * observed active never enters the set.
 *
 * This only tracks the bounded retention set. Deciding when to mount, and
 * guaranteeing a genuinely-visible node is never torn down, is the caller's job
 * (MiniAppView latches on `settled || live` to boot and `inView || live` to stay
 * mounted) — this hook intentionally does NOT see the raw in-view signal.
 */
export function useMiniAppKeepAlive(id: string, active: boolean): boolean {
  const isLive = useKeepAliveStore((s) => s.live.includes(id))
  const touch = useKeepAliveStore((s) => s.touch)
  const release = useKeepAliveStore((s) => s.release)
  const wasActive = useRef(false)

  useEffect(() => {
    if (active) wasActive.current = true
    // Touch on active-enter and on active-exit (was active, just left) — but
    // never for a node that has never been active.
    if (active || wasActive.current) touch(id)
  }, [active, id, touch])

  useEffect(() => () => release(id), [id, release])

  return isLive
}
