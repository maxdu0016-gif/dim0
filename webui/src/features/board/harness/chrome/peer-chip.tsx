import { memo } from "react"
import { useNodes, usePresence } from "@canvas-harness/react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"


/**
 * Peer status chip — avatar stack + hover popover with the live peer list.
 *
 * Sits next to `HarnessCollabStatus` in the top-right chrome row.
 * Hidden when there are no remote peers (avoids chip noise on solo
 * sessions). Reads from canvas-harness's presence subsystem, which
 * the WS adapter (`use-ws-collab`) populates via `applyRemote` —
 * both from the welcome map (3.2) and from live `peer-presence`
 * frames.
 *
 * The popover surfaces each peer's name, color avatar, and an
 * "editing X" line when `state.editing` resolves to a known node.
 * That's the soft edit indicator — no enforcement, just awareness.
 */
export const HarnessPeerChip = memo(function HarnessPeerChip() {
  const remotes = usePresence()
  const peers = [...remotes.values()].filter((p) => p.name)
  if (peers.length === 0) return null

  // Avatar stack: up to 3 visible chips, "+N" overflow.
  const visible = peers.slice(0, 3)
  const overflow = peers.length - visible.length

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${peers.length} ${peers.length === 1 ? "peer" : "peers"} online`}
          className={cn(
            "flex items-center gap-1 rounded-md border border-border bg-background/95 px-2 py-1",
            "text-xs shadow-sm backdrop-blur transition-colors hover:bg-muted",
          )}
        >
          <div className="flex -space-x-1.5">
            {visible.map((peer) => (
              <PeerAvatar
                key={peer.clientId as unknown as string}
                color={peer.color}
                initial={initialFor(peer.name)}
              />
            ))}
          </div>
          {overflow > 0 ? (
            <span className="ml-1 text-muted-foreground">+{overflow}</span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2 text-xs" role="status">
        <div className="flex flex-col gap-1">
          {peers.map((peer) => (
            <PeerRow
              key={peer.clientId as unknown as string}
              color={peer.color}
              name={peer.name ?? "Anonymous"}
              editingNodeId={peer.editing as string | null | undefined}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
})


const PeerAvatar = ({ color, initial }: { color: string; initial: string }) => (
  <div
    className="flex h-5 w-5 items-center justify-center rounded-full border border-background text-[10px] font-semibold text-white"
    style={{ backgroundColor: color }}
    aria-hidden="true"
  >
    {initial}
  </div>
)


/**
 * One row in the popover — avatar, name, and an "editing X" indicator
 * when the peer is mid-edit. Looks the editing node id up against the
 * canvas-harness store via `useNodes` so we show the node's label
 * instead of a raw id.
 */
const PeerRow = ({
  color,
  name,
  editingNodeId,
}: {
  color: string
  name: string
  editingNodeId: string | null | undefined
}) => {
  const nodes = useNodes()
  const editingNode = editingNodeId
    ? nodes.find((n) => (n.id as unknown as string) === editingNodeId)
    : null
  const editingLabel = editingNode?.content?.split("\n", 1)[0].trim() || null
  return (
    <div className="flex items-start gap-2 rounded-sm px-1.5 py-1">
      <PeerAvatar color={color} initial={initialFor(name)} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground">{name}</span>
        {editingNodeId ? (
          <span className="truncate text-muted-foreground">
            {editingLabel ? `Editing "${editingLabel}"` : "Editing"}
          </span>
        ) : null}
      </div>
    </div>
  )
}


/** Single-letter avatar text — first non-space char of the name, uppercased. */
const initialFor = (name: string): string => {
  const trimmed = name.trim()
  return trimmed ? trimmed[0].toUpperCase() : "?"
}
