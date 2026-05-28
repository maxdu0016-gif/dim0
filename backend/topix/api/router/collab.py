"""Collaboration router — ticket mint endpoint + WebSocket relay (Phase 1a).

The relay is intentionally minimal: every text frame received on a
socket is forwarded verbatim to all other sockets in the same room.
The wire shape is whatever the client adapter sends (today it mirrors
the BroadcastChannel adapter — `{kind: "batch" | "presence" | ...}`).
Server-side sequencing, snapshot-on-hello, and op application land in
Phase 1b.
"""

import logging

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, Response, WebSocket, WebSocketDisconnect

from topix.api.utils.decorators import with_standard_response
from topix.api.utils.security import get_current_user_uid, verify_board_member
from topix.collab.room import RoomRegistry
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

    registry: RoomRegistry = websocket.app.collab_rooms
    room, client = await registry.join(graph_id, websocket, user_id)
    logger.info("collab join board=%s user=%s client=%s", graph_id, user_id, client.client_id)

    try:
        while True:
            raw = await websocket.receive_text()
            await room.broadcast(raw, exclude=client)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("collab socket error board=%s client=%s", graph_id, client.client_id)
    finally:
        await registry.leave(room, client)
        logger.info("collab leave board=%s client=%s", graph_id, client.client_id)
