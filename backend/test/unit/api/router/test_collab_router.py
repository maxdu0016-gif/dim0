"""Router tests for the collab ticket mint endpoint and the WS relay."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from topix.api.router.collab import router
from topix.api.utils.security import get_current_user_uid
from topix.collab.room import RoomRegistry
from topix.collab.tickets import mint_ticket


class _FakeRedis:
    def __init__(self):
        self.store: dict[str, str] = {}

    async def set(self, key, value, ex=None):
        self.store[key] = value

    async def getdel(self, key):
        return self.store.pop(key, None)


class _FakeRedisStore:
    def __init__(self):
        self.redis = _FakeRedis()


class _FakeGraphStore:
    """Stub GraphStore exposing only what verify_board_member touches."""

    def __init__(self, role: str = "owner"):
        self.role = role

    async def get_graph_role(self, graph_uid: str, user_uid: str) -> str | None:
        return self.role


def _build_app(*, user_uid: str = "u1", role: str = "owner") -> tuple[TestClient, FastAPI]:
    app = FastAPI()
    app.include_router(router)
    app.graph_store = _FakeGraphStore(role=role)
    app.redis_store = _FakeRedisStore()
    app.collab_rooms = RoomRegistry()

    async def _fake_current_user_uid():
        return user_uid

    app.dependency_overrides[get_current_user_uid] = _fake_current_user_uid
    return TestClient(app), app


# ---------------------------------------------------------------------------
# Ticket mint endpoint
# ---------------------------------------------------------------------------

def test_mint_ticket_owner_succeeds():
    """An owner of the board can mint a ticket."""
    client, _ = _build_app(role="owner")

    response = client.post("/boards/board-1/collab/ticket")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["data"]["expires_in"] == 30
    assert isinstance(body["data"]["ticket"], str) and body["data"]["ticket"]


def test_mint_ticket_non_member_is_rejected():
    """A user with no role on the board cannot mint a ticket."""
    client, _ = _build_app(role=None)

    response = client.post("/boards/board-1/collab/ticket")

    # verify_board_member returns 404 to avoid existence leaks.
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# WebSocket auth path
# ---------------------------------------------------------------------------

def _expect_ws_close(client: TestClient, url: str, expected_code: int) -> None:
    """Open a WS, expect the server to refuse with `expected_code`.

    Starlette's TestClient raises `WebSocketDisconnect` from
    `websocket_connect`'s `__enter__` when the server closes during the
    upgrade — so the try/except must wrap the `with` block itself.
    """
    from starlette.websockets import WebSocketDisconnect

    try:
        with client.websocket_connect(url):
            pass
    except WebSocketDisconnect as exc:
        assert exc.code == expected_code, f"expected close code {expected_code}, got {exc.code}"
        return
    raise AssertionError(f"expected WebSocketDisconnect({expected_code}) for url={url}")


def test_ws_rejects_missing_ticket():
    """A WS upgrade without a ticket is closed with 4401."""
    client, _ = _build_app()
    _expect_ws_close(client, "/boards/board-1/collab", expected_code=4401)


def test_ws_rejects_invalid_ticket():
    """An unknown ticket is rejected with 4401."""
    client, _ = _build_app()
    _expect_ws_close(client, "/boards/board-1/collab?ticket=nope", expected_code=4401)


def test_ws_rejects_ticket_for_different_board():
    """A ticket minted for board A cannot be used to join board B (4403)."""
    client, app = _build_app()

    import asyncio
    loop = asyncio.new_event_loop()
    try:
        token = loop.run_until_complete(
            mint_ticket(app.redis_store, user_id="u1", board_id="board-a")
        )
    finally:
        loop.close()

    _expect_ws_close(client, f"/boards/board-b/collab?ticket={token}", expected_code=4403)


# ---------------------------------------------------------------------------
# WebSocket relay happy path
# ---------------------------------------------------------------------------

def test_ws_relays_messages_between_peers():
    """A frame from one peer is forwarded to other connected peers in the same room."""
    client, app = _build_app()

    import asyncio
    loop = asyncio.new_event_loop()
    try:
        t1 = loop.run_until_complete(mint_ticket(app.redis_store, user_id="u1", board_id="b1"))
        t2 = loop.run_until_complete(mint_ticket(app.redis_store, user_id="u2", board_id="b1"))
    finally:
        loop.close()

    with client.websocket_connect(f"/boards/b1/collab?ticket={t1}") as ws1:
        with client.websocket_connect(f"/boards/b1/collab?ticket={t2}") as ws2:
            ws1.send_text('{"kind":"presence","clientId":"c1","state":{}}')
            received = ws2.receive_text()
            assert received == '{"kind":"presence","clientId":"c1","state":{}}'


def test_ws_two_peers_same_board_register_in_same_room():
    """Two peers using tickets for the same board land in one Room."""
    client, app = _build_app()

    import asyncio
    loop = asyncio.new_event_loop()
    try:
        t1 = loop.run_until_complete(mint_ticket(app.redis_store, user_id="u1", board_id="b1"))
        t2 = loop.run_until_complete(mint_ticket(app.redis_store, user_id="u2", board_id="b1"))
    finally:
        loop.close()

    with client.websocket_connect(f"/boards/b1/collab?ticket={t1}"):
        with client.websocket_connect(f"/boards/b1/collab?ticket={t2}"):
            room = app.collab_rooms._rooms["b1"]
            assert len(room.clients) == 2


def test_ws_drops_room_after_last_disconnect():
    """The room is removed from the registry once both peers leave."""
    client, app = _build_app()

    import asyncio
    loop = asyncio.new_event_loop()
    try:
        t1 = loop.run_until_complete(mint_ticket(app.redis_store, user_id="u1", board_id="b1"))
    finally:
        loop.close()

    with client.websocket_connect(f"/boards/b1/collab?ticket={t1}"):
        pass  # disconnect immediately

    # After the context exits the registry should not retain the empty room.
    # TestClient is synchronous, but the server's `finally` runs before the
    # context manager returns, so the cleanup has already happened by here.
    assert "b1" not in app.collab_rooms._rooms
