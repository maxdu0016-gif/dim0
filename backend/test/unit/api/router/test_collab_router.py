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
    """Stub GraphStore covering the surface the collab router actually uses.

    Records every mutating call so op-flow tests can assert that
    `apply_batch` reached the underlying store.
    """

    def __init__(self, role: str = "owner", owner_uid: str = "u1"):
        self.role = role
        self.owner_uid = owner_uid
        self.patch_calls: list = []
        self.add_notes_calls: list = []
        self.delete_node_calls: list = []
        self.add_links_calls: list = []
        self.update_link_calls: list = []
        self.delete_link_calls: list = []

    async def get_graph_role(self, graph_uid: str, user_uid: str) -> str | None:
        return self.role

    async def get_owner_uid(self, graph_uid: str) -> str | None:
        return self.owner_uid

    async def get_graph(self, *, graph_uid: str, root_id: str | None = None):
        # Empty board — welcome.snapshot will be {}.
        return None

    async def patch_note(self, *, node_id, data, user_uid):
        self.patch_calls.append({"node_id": node_id, "data": data, "user_uid": user_uid})

    async def add_notes(self, *, nodes):
        self.add_notes_calls.append(nodes)

    async def delete_node(self, *, node_id, user_uid):
        self.delete_node_calls.append({"node_id": node_id, "user_uid": user_uid})

    async def add_links(self, *, links):
        self.add_links_calls.append(links)

    async def update_link(self, *, link_id, data):
        self.update_link_calls.append({"link_id": link_id, "data": data})

    async def delete_link(self, *, link_id):
        self.delete_link_calls.append(link_id)


class _FakeUserBillingStore:
    """Stub UserBillingStore — only `get_user_billing` is consulted by
    the capacity check. A None return means the owner has no billing
    row, which the capacity module treats as the free-tier cap (5)."""

    def __init__(self, plan: str | None = None):
        # If `plan` is None, we behave as "no row" (free default).
        self.plan = plan

    async def get_user_billing(self, user_uid: str):
        if self.plan is None:
            return None
        # Lightweight stand-in for UserBilling — only `.plan` is read.
        class _Billing:
            pass
        b = _Billing()
        b.plan = self.plan
        return b


def _build_app(
    *,
    user_uid: str = "u1",
    role: str = "owner",
    owner_uid: str = "u1",
    plan: str | None = None,
) -> tuple[TestClient, FastAPI]:
    app = FastAPI()
    app.include_router(router)
    app.graph_store = _FakeGraphStore(role=role, owner_uid=owner_uid)
    app.user_billing_store = _FakeUserBillingStore(plan=plan)
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

def _mint_tickets(app, role: str = "member", **bindings):
    """Helper to mint many tickets in one synchronous block.

    `role` defaults to "member" so tests of edit paths keep working
    without changes; viewer / owner tests pass it explicitly.
    """
    import asyncio
    loop = asyncio.new_event_loop()
    try:
        return {
            label: loop.run_until_complete(
                mint_ticket(app.redis_store, user_id=user_id, board_id=board_id, role=role)
            )
            for label, (user_id, board_id) in bindings.items()
        }
    finally:
        loop.close()


def _drain_welcome(ws) -> dict:
    """Consume the welcome frame the server sends right after accept."""
    msg = ws.receive_json()
    assert msg["kind"] == "welcome"
    return msg


def test_ws_sends_welcome_with_seq_and_snapshot_on_connect():
    """First frame to a freshly-connected peer is `welcome { seq, snapshot }`."""
    client, app = _build_app()
    tickets = _mint_tickets(app, t1=("u1", "b1"))

    with client.websocket_connect(f"/boards/b1/collab?ticket={tickets['t1']}") as ws:
        welcome = ws.receive_json()
        assert welcome["kind"] == "welcome"
        assert welcome["seq"] == 0
        assert welcome["snapshot"] == {}


def test_ws_relays_presence_between_peers():
    """A `presence` frame is still relayed verbatim through the room."""
    client, app = _build_app()
    tickets = _mint_tickets(app, t1=("u1", "b1"), t2=("u2", "b1"))

    with client.websocket_connect(f"/boards/b1/collab?ticket={tickets['t1']}") as ws1:
        _drain_welcome(ws1)
        with client.websocket_connect(f"/boards/b1/collab?ticket={tickets['t2']}") as ws2:
            _drain_welcome(ws2)
            ws1.send_text('{"kind":"presence","clientId":"c1","state":{}}')
            received = ws2.receive_text()
            assert received == '{"kind":"presence","clientId":"c1","state":{}}'


def test_ws_op_message_sequences_and_broadcasts_peer_op():
    """An incoming `op` is applied via apply_batch, assigned a seq,
    broadcast as `peer-op` to other clients, and acked back to the
    sender as `op-applied`.
    """
    client, app = _build_app()
    tickets = _mint_tickets(app, t1=("u1", "b1"), t2=("u2", "b1"))

    with client.websocket_connect(f"/boards/b1/collab?ticket={tickets['t1']}") as sender:
        _drain_welcome(sender)
        with client.websocket_connect(f"/boards/b1/collab?ticket={tickets['t2']}") as peer:
            _drain_welcome(peer)

            sender.send_json({
                "kind": "op",
                "client_seq": 7,
                "batch": {
                    "id": "batch-1",
                    "clientId": "alice",
                    "origin": "local",
                    "ops": [
                        {"type": "node.update", "id": "n1", "patch": {"x": 200, "y": 150}, "prev": {}},
                    ],
                },
            })

            ack = sender.receive_json()
            assert ack["kind"] == "op-applied"
            assert ack["seq"] == 1
            assert ack["client_seq"] == 7

            peer_op = peer.receive_json()
            assert peer_op["kind"] == "peer-op"
            assert peer_op["seq"] == 1
            assert peer_op["batch"]["id"] == "batch-1"

            # apply_batch reached the store
            assert len(app.graph_store.patch_calls) == 1
            assert app.graph_store.patch_calls[0]["node_id"] == "n1"


def test_ws_op_seq_is_monotonic_across_ops():
    """Two ops from the same sender should be assigned seq=1 then seq=2."""
    client, app = _build_app()
    tickets = _mint_tickets(app, t1=("u1", "b1"))

    with client.websocket_connect(f"/boards/b1/collab?ticket={tickets['t1']}") as ws:
        _drain_welcome(ws)
        for client_seq in (1, 2):
            ws.send_json({
                "kind": "op",
                "client_seq": client_seq,
                "batch": {
                    "id": f"b{client_seq}",
                    "clientId": "alice",
                    "origin": "local",
                    "ops": [{"type": "node.remove", "node": {"id": f"n{client_seq}"}}],
                },
            })
            ack = ws.receive_json()
            assert ack["seq"] == client_seq
            assert ack["client_seq"] == client_seq


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


# ---------------------------------------------------------------------------
# Slice 2: role on the ticket + viewer reject + room-capacity cap
# ---------------------------------------------------------------------------

def test_ticket_response_carries_user_role():
    """The mint endpoint returns the user's role on the board."""
    client, _ = _build_app(role="viewer")

    response = client.post("/boards/b1/collab/ticket")

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["role"] == "viewer"


def test_ticket_mint_404s_for_unaffiliated_user():
    """A user with no role on the board cannot mint a ticket."""
    client, _ = _build_app(role=None)

    response = client.post("/boards/b1/collab/ticket")

    assert response.status_code == 404


def test_ws_viewer_op_is_rejected_with_op_rejected():
    """A viewer connecting and sending `op` receives `op-rejected`; the
    underlying GraphStore is never touched."""
    client, app = _build_app(role="viewer")
    tickets = _mint_tickets(app, role="viewer", t=("u1", "b1"))

    with client.websocket_connect(f"/boards/b1/collab?ticket={tickets['t']}") as ws:
        _drain_welcome(ws)
        ws.send_json({
            "kind": "op",
            "client_seq": 1,
            "batch": {
                "id": "b1",
                "clientId": "viewer",
                "origin": "local",
                "ops": [{"type": "node.update", "id": "n1", "patch": {"x": 1, "y": 2}, "prev": {}}],
            },
        })
        ack = ws.receive_json()

    assert ack["kind"] == "op-rejected"
    assert ack["client_seq"] == 1
    assert ack["reason"] == "read-only"
    # The graph store was NOT touched.
    assert len(app.graph_store.patch_calls) == 0


def test_ws_member_op_still_applies_normally():
    """Members still get the standard op-applied + peer-op pair (no regression)."""
    client, app = _build_app(role="member")
    tickets = _mint_tickets(app, t=("u1", "b1"))

    with client.websocket_connect(f"/boards/b1/collab?ticket={tickets['t']}") as ws:
        _drain_welcome(ws)
        ws.send_json({
            "kind": "op",
            "client_seq": 1,
            "batch": {
                "id": "b1",
                "clientId": "alice",
                "origin": "local",
                "ops": [{"type": "node.update", "id": "n1", "patch": {"x": 1, "y": 2}, "prev": {}}],
            },
        })
        ack = ws.receive_json()

    assert ack["kind"] == "op-applied"
    assert ack["seq"] == 1
    assert len(app.graph_store.patch_calls) == 1


def test_ws_room_full_closes_sixth_join_on_free_plan():
    """Free-tier owners cap their rooms at 5 actors; the 6th gets 4429."""
    from contextlib import ExitStack
    from starlette.websockets import WebSocketDisconnect

    client, app = _build_app(role="member", plan="free")  # cap = 5

    # Pre-mint 6 tickets (each can only be consumed once).
    tickets = [
        _mint_tickets(app, **{f"t{i}": (f"u{i}", "b1")})[f"t{i}"]
        for i in range(6)
    ]

    with ExitStack() as stack:
        for tok in tickets[:5]:
            ws = stack.enter_context(client.websocket_connect(f"/boards/b1/collab?ticket={tok}"))
            _drain_welcome(ws)

        # Sixth joiner — server should accept, see the cap, and close
        # with 4429 before the welcome is sent.
        raised = False
        try:
            with client.websocket_connect(f"/boards/b1/collab?ticket={tickets[5]}") as ws6:
                ws6.receive_json()
        except WebSocketDisconnect as exc:
            raised = True
            assert exc.code == 4429
        assert raised, "expected room-full close on 6th joiner"
