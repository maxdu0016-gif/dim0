"""Collaboration router — ticket mint endpoint + WebSocket session (Phase 1b).

Per-board WebSocket session:

  1. Ticket exchange validates `(user_id, board_id)`.
  2. On accept, a `welcome { seq, snapshot }` is sent inside the room's
     lock so a racing `peer-op` cannot precede it on this socket.
  3. Incoming `{ kind: "op", batch, client_seq }` is applied to the
     `GraphStore` under the lock, assigned the next monotonic `seq`,
     and rebroadcast as `peer-op` to all other clients. The sender gets
     `op-applied { seq, client_seq }` ack on the same lock.
  4. Other message kinds (presence, hello, presence-leave) still relay
     verbatim — those graduate to `peer-*` shapes in Phase 3.
"""

import json
import logging

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, Response, WebSocket, WebSocketDisconnect

from topix.api.utils.decorators import with_standard_response
from topix.api.utils.security import get_current_user_uid, verify_board_member
from topix.collab.apply_ops import apply_batch
from topix.collab.room import Client, Room, RoomRegistry
from topix.collab.snapshot import read_snapshot_payload
from topix.collab.tickets import consume_ticket, mint_ticket

logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/boards",
    tags=["collab"],
    responses={404: {"description": "Not found"}},
)


# Close codes — 4000-4999 range is reserved for app-defined per RFC 6455.
WS_INVALID_TICKET = 4401
WS_BOARD_MISMATCH = 4403


@router.post("/{graph_id}/collab/ticket/", include_in_schema=False)
@router.post("/{graph_id}/collab/ticket")
@with_standard_response
async def mint_collab_ticket(
    response: Response,
    request: Request,
    graph_id: Annotated[str, Path(description="Graph ID")],
    user_id: Annotated[str, Depends(get_current_user_uid)],
    _: Annotated[None, Depends(verify_board_member)],
):
    """Mint a short-lived single-use ticket the client exchanges on WS upgrade."""
    token = await mint_ticket(request.app.redis_store, user_id=user_id, board_id=graph_id)
    return {"ticket": token, "expires_in": 30}


@router.websocket("/{graph_id}/collab")
async def collab_ws(
    websocket: WebSocket,
    graph_id: Annotated[str, Path(description="Graph ID")],
    ticket: Annotated[str | None, Query(description="One-shot auth ticket")] = None,
):
    """Per-board relay socket.

    Authenticates via a one-shot Redis-backed ticket, then forwards
    every text frame to other clients in the room. Self-echo
    suppression is handled by excluding the sender from broadcast.
    """
    if not ticket:
        await websocket.close(code=WS_INVALID_TICKET, reason="missing ticket")
        return

    payload = await consume_ticket(websocket.app.redis_store, ticket)
    if not payload:
        await websocket.close(code=WS_INVALID_TICKET, reason="invalid or expired ticket")
        return
    if payload.get("board_id") != graph_id:
        await websocket.close(code=WS_BOARD_MISMATCH, reason="ticket board mismatch")
        return

    user_id: str = payload["user_id"]

    await websocket.accept()

    graph_store = websocket.app.graph_store
    registry: RoomRegistry = websocket.app.collab_rooms
    room, client = await registry.join(graph_id, websocket, user_id)
    logger.info("collab join board=%s user=%s client=%s", graph_id, user_id, client.client_id)

    # Welcome handshake — read seq + snapshot AND send the welcome
    # while holding the room lock, so a racing op-handler can't queue
    # a `peer-op` on this socket before the welcome lands.
    try:
        async with room.lock:
            seq = room.seq
            snapshot = await read_snapshot_payload(graph_store=graph_store, board_id=graph_id)
            await websocket.send_json({
                "kind": "welcome",
                "seq": seq,
                "snapshot": snapshot,
            })
    except Exception:
        logger.exception("collab welcome send failed board=%s", graph_id)
        await registry.leave(room, client)
        return

    try:
        while True:
            raw = await websocket.receive_text()
            await _handle_message(
                websocket=websocket,
                raw=raw,
                graph_store=graph_store,
                room=room,
                client=client,
                board_id=graph_id,
                user_id=user_id,
            )
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("collab socket error board=%s client=%s", graph_id, client.client_id)
    finally:
        await registry.leave(room, client)
        logger.info("collab leave board=%s client=%s", graph_id, client.client_id)


async def _handle_message(
    *,
    websocket: WebSocket,
    raw: str,
    graph_store,
    room: Room,
    client: Client,
    board_id: str,
    user_id: str,
) -> None:
    """Dispatch one inbound frame.

    `op` frames go through the sequencer+applier+broadcaster under the
    room lock; everything else still relays verbatim for Phase 1b. The
    presence path will become a structured `peer-presence` in Phase 3.
    """
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        return

    kind = msg.get("kind") if isinstance(msg, dict) else None

    if kind == "op":
        batch = msg.get("batch") or {}
        client_seq = msg.get("client_seq")
        ops = batch.get("ops") or []
        async with room.lock:
            seq = room.next_seq_unlocked()
            await apply_batch(
                graph_store=graph_store,
                board_id=board_id,
                user_id=user_id,
                ops=ops,
            )
            peer_op = json.dumps({"kind": "peer-op", "seq": seq, "batch": batch})
            # Send under the lock so peer-op ordering across peers
            # matches the seq order. Head-of-line latency to one peer
            # blocks the room briefly; per-peer outbox queues are a
            # Phase 3 optimization.
            for c in list(room.clients.values()):
                if c is client:
                    try:
                        await c.socket.send_json({
                            "kind": "op-applied",
                            "seq": seq,
                            "client_seq": client_seq,
                        })
                    except Exception:
                        logger.debug("collab op-applied send failed", exc_info=True)
                else:
                    try:
                        await c.socket.send_text(peer_op)
                    except Exception:
                        logger.debug("collab peer-op send failed", exc_info=True)
        return

    # Non-op kinds (presence, hello, presence-leave): relay verbatim.
    await room.broadcast(raw, exclude=client)
