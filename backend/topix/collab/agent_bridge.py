"""Server-side bridge that lets the agent appear as a room client.

The agent runs in-process, not over a WebSocket — but with "collab is
the only edit path" (collab-archi §1) every mutation must produce a
`peer-op` so live browsers see it. The bridge:

1. Performs the actual DB mutation via the existing `GraphStore` API.
2. If a Room exists for that board (someone is connected), broadcasts
   a `peer-op` carrying the corresponding canvas-harness op so peer
   browsers apply the change via `attachSync`'s remote-batch path.

When no Room exists, the broadcast step no-ops; persistence already
happened on step 1. The next browser to open the board will load the
post-mutation snapshot via the welcome handshake.
"""

import json
import logging
import time

from typing import Any

from topix.collab.note_to_wire import (
    link_to_wire_edge,
    note_to_wire_node,
    patch_data_to_wire_patch,
)
from topix.collab.room import RoomRegistry
from topix.datatypes.note.link import Link
from topix.datatypes.note.note import Note
from topix.store.graph import GraphStore

logger = logging.getLogger(__name__)


AGENT_CLIENT_ID = "agent"


class AgentBoardBridge:
    """Mutate the board via GraphStore and broadcast the matching peer-op.

    Public surface mirrors the subset of `GraphStore` that agent tools
    actually call. Each method:
      (a) persists via the underlying GraphStore (with the existing
          per-note locks and embed-skip fast path),
      (b) emits a `peer-op` with the equivalent canvas-harness op tagged
          `is_system: true` so the UI can label the originator.
    """

    def __init__(self, graph_store: GraphStore, registry: RoomRegistry):
        """Wrap the given graph_store + room registry."""
        self._graph_store = graph_store
        self._registry = registry

    async def add_notes(self, *, board_id: str, notes: list[Note]) -> None:
        """Add notes; broadcasts one `peer-op` containing N `node.add` ops."""
        for note in notes:
            if note.graph_uid is None:
                note.graph_uid = board_id
        await self._graph_store.add_notes(nodes=notes)
        ops = [{"type": "node.add", "node": note_to_wire_node(n)} for n in notes]
        await self._broadcast(board_id=board_id, ops=ops)

    async def patch_note(
        self,
        *,
        board_id: str,
        node_id: str,
        data: dict[str, Any],
        user_uid: str | None,
    ) -> Note | None:
        """Patch a note; broadcasts the equivalent `node.update`."""
        result = await self._graph_store.patch_note(
            node_id=node_id, data=data, user_uid=user_uid,
        )
        if result is None:
            return None
        wire_patch = patch_data_to_wire_patch(data)
        if wire_patch:
            await self._broadcast(
                board_id=board_id,
                ops=[{
                    "type": "node.update",
                    "id": node_id,
                    "patch": wire_patch,
                    "prev": {},
                }],
            )
        return result

    async def delete_node(
        self,
        *,
        board_id: str,
        node_id: str,
        user_uid: str | None,
    ) -> None:
        """Delete a note; broadcasts `node.remove`."""
        await self._graph_store.delete_node(node_id=node_id, user_uid=user_uid)
        await self._broadcast(
            board_id=board_id,
            ops=[{"type": "node.remove", "node": {"id": node_id}}],
        )

    async def add_links(self, *, board_id: str, links: list[Link]) -> None:
        """Add links; broadcasts one `peer-op` with N `edge.add` ops."""
        for link in links:
            if link.graph_uid is None:
                link.graph_uid = board_id
        await self._graph_store.add_links(links=links)
        ops = [{"type": "edge.add", "edge": link_to_wire_edge(link)} for link in links]
        await self._broadcast(board_id=board_id, ops=ops)

    async def delete_link(self, *, board_id: str, link_id: str) -> None:
        """Delete a link; broadcasts `edge.remove`."""
        await self._graph_store.delete_link(link_id=link_id)
        await self._broadcast(
            board_id=board_id,
            ops=[{"type": "edge.remove", "edge": {"id": link_id}}],
        )

    # ------------------------------------------------------------------

    async def _broadcast(self, *, board_id: str, ops: list[dict[str, Any]]) -> None:
        """Send a `peer-op` to every connected client in `board_id`'s room.

        Acquires `room.lock` so the assigned seq is consistent with the
        broadcast ordering — same invariant the human WS handler uses.
        No-ops when no Room exists (no live session = no listeners).
        """
        room = self._registry.get(board_id)
        if room is None:
            return
        async with room.lock:
            seq = room.next_seq_unlocked()
            peer_op = json.dumps({
                "kind": "peer-op",
                "seq": seq,
                "batch": {
                    "id": f"agent-{seq}",
                    "clientId": AGENT_CLIENT_ID,
                    "ts": int(time.time() * 1000),
                    "origin": "remote",
                    "ops": ops,
                    "is_system": True,
                },
            })
            for c in list(room.clients.values()):
                try:
                    await c.socket.send_text(peer_op)
                except Exception:
                    logger.debug("agent bridge peer-op send failed", exc_info=True)
