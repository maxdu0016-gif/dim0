"""In-process room registry for collab Phase 1a.

A Room is the per-board set of currently-connected sockets. Messages
received on one socket are forwarded to all other sockets in the same
room (pure relay — no sequencing, no DB writes). The room is created
lazily on first join and torn down when the last client leaves.
"""

import asyncio
import logging
import uuid

from dataclasses import dataclass, field

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class Client:
    """One connected socket inside a Room."""

    client_id: str
    user_id: str
    socket: WebSocket


@dataclass
class Room:
    """Per-board in-memory presence + sequenced op relay.

    `lock` serializes both membership changes and op sequencing so a
    `peer-op` broadcast can never observe a seq earlier than its own
    DB apply. `send` calls inside `broadcast` run outside the lock so
    a slow peer doesn't block ordering for the rest of the room.

    `seq` is the monotonic per-room sequence assigned to every applied
    op. Survives the lifetime of the in-process Room; rooms reset to 0
    on first creation (acceptable for Phase 1b — Phase 1c may pin it
    to a Redis INCR for cross-restart durability).
    """

    board_id: str
    clients: dict[str, Client] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    seq: int = 0

    def next_seq_unlocked(self) -> int:
        """Caller must hold `self.lock`. Assigns the next monotonic seq."""
        self.seq += 1
        return self.seq

    async def add(self, socket: WebSocket, user_id: str) -> Client:
        """Register a connected socket; return the assigned Client."""
        client = Client(client_id=str(uuid.uuid4()), user_id=user_id, socket=socket)
        async with self.lock:
            self.clients[client.client_id] = client
        return client

    async def remove(self, client: Client) -> int:
        """Detach a client; return the remaining client count."""
        async with self.lock:
            self.clients.pop(client.client_id, None)
            return len(self.clients)

    async def broadcast(self, raw: str, exclude: Client | None = None) -> None:
        """Forward a raw text frame to every other client in the room."""
        async with self.lock:
            targets = [c for c in self.clients.values() if c is not exclude]
        for c in targets:
            try:
                await c.socket.send_text(raw)
            except Exception:
                # Best-effort: a dead socket will be cleaned up on its
                # own disconnect handler. We don't tear the room down
                # over one failed send.
                logger.debug("collab broadcast send failed", exc_info=True)


class RoomRegistry:
    """Lazily-created per-board Room instances for one worker process."""

    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}
        self._lock = asyncio.Lock()

    async def join(self, board_id: str, socket: WebSocket, user_id: str) -> tuple[Room, Client]:
        """Join (or create) the room for `board_id` and return (room, client)."""
        async with self._lock:
            room = self._rooms.get(board_id)
            if room is None:
                room = Room(board_id=board_id)
                self._rooms[board_id] = room
        client = await room.add(socket, user_id)
        return room, client

    async def leave(self, room: Room, client: Client) -> None:
        """Remove a client; drop the room from the registry if it's now empty."""
        remaining = await room.remove(client)
        if remaining == 0:
            async with self._lock:
                # Re-check under the lock: someone may have re-joined.
                if self._rooms.get(room.board_id) is room and not room.clients:
                    self._rooms.pop(room.board_id, None)
