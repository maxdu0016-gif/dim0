"""Unit tests for Room + RoomRegistry — pure-Python, no FastAPI."""

import asyncio

import pytest

from topix.collab.room import Room, RoomRegistry


class FakeSocket:
    """Stand-in for fastapi.WebSocket — only `send_text` is exercised."""

    def __init__(self, *, fail: bool = False):
        self.sent: list[str] = []
        self.fail = fail

    async def send_text(self, raw: str) -> None:
        if self.fail:
            raise RuntimeError("dead socket")
        self.sent.append(raw)


async def test_room_broadcast_skips_sender():
    """A client that sends a frame should not receive it back."""
    room = Room(board_id="b1")
    s1, s2, s3 = FakeSocket(), FakeSocket(), FakeSocket()
    c1 = await room.add(s1, "u1")
    await room.add(s2, "u2")
    await room.add(s3, "u3")

    await room.broadcast("hello", exclude=c1)

    assert s1.sent == []
    assert s2.sent == ["hello"]
    assert s3.sent == ["hello"]


async def test_room_broadcast_with_no_exclude_sends_to_all():
    """When no sender is excluded, every connected client receives the frame."""
    room = Room(board_id="b1")
    s1, s2 = FakeSocket(), FakeSocket()
    await room.add(s1, "u1")
    await room.add(s2, "u2")

    await room.broadcast("ping")

    assert s1.sent == ["ping"]
    assert s2.sent == ["ping"]


async def test_room_broadcast_tolerates_failing_socket():
    """A dead socket should not prevent siblings from receiving the frame."""
    room = Room(board_id="b1")
    s_ok = FakeSocket()
    s_dead = FakeSocket(fail=True)
    await room.add(s_ok, "u1")
    await room.add(s_dead, "u2")

    # Should not raise; the dead socket is best-effort.
    await room.broadcast("payload")

    assert s_ok.sent == ["payload"]
    assert s_dead.sent == []


async def test_room_remove_returns_remaining_count():
    """`remove` returns the count of clients still in the room after removal."""
    room = Room(board_id="b1")
    s1, s2 = FakeSocket(), FakeSocket()
    c1 = await room.add(s1, "u1")
    c2 = await room.add(s2, "u2")

    assert await room.remove(c1) == 1
    assert await room.remove(c2) == 0


async def test_registry_lazily_creates_room_and_shares_across_joins():
    """Two joins to the same board reuse one Room; different boards get different Rooms."""
    registry = RoomRegistry()
    s1, s2, s3 = FakeSocket(), FakeSocket(), FakeSocket()

    room_a1, _ = await registry.join("board-a", s1, "u1")
    room_a2, _ = await registry.join("board-a", s2, "u2")
    room_b, _ = await registry.join("board-b", s3, "u3")

    assert room_a1 is room_a2
    assert room_a1 is not room_b
    assert len(room_a1.clients) == 2
    assert len(room_b.clients) == 1


async def test_registry_drops_room_when_last_client_leaves():
    """Once every client leaves, the Room is removed from the registry."""
    registry = RoomRegistry()
    s1 = FakeSocket()
    room, client = await registry.join("board-a", s1, "u1")

    await registry.leave(room, client)

    # New join on the same board_id creates a fresh Room (not the dropped one).
    s2 = FakeSocket()
    room2, _ = await registry.join("board-a", s2, "u2")
    assert room2 is not room


async def test_registry_keeps_room_alive_while_other_clients_remain():
    """Leaving one client must not evict the Room if siblings are still connected."""
    registry = RoomRegistry()
    s1, s2 = FakeSocket(), FakeSocket()
    room, c1 = await registry.join("board-a", s1, "u1")
    _, _ = await registry.join("board-a", s2, "u2")

    await registry.leave(room, c1)

    # The other client is still there, so a third join should reuse the same Room.
    s3 = FakeSocket()
    room2, _ = await registry.join("board-a", s3, "u3")
    assert room2 is room
    assert len(room.clients) == 2


async def test_registry_concurrent_joins_share_one_room():
    """Concurrent joins on the same board must not race two Room instances into existence."""
    registry = RoomRegistry()
    sockets = [FakeSocket() for _ in range(10)]

    results = await asyncio.gather(
        *(registry.join("board-x", s, f"u{i}") for i, s in enumerate(sockets))
    )

    # Room is a dataclass (unhashable by default) so identity-compare directly.
    first_room = results[0][0]
    for room, _ in results[1:]:
        assert room is first_room
    assert len(first_room.clients) == 10


@pytest.fixture(autouse=True)
def _silence_logs(caplog):
    """Best-effort send failures log at DEBUG; keep the test output quiet."""
    caplog.set_level("WARNING", logger="topix.collab.room")
    yield
