"""API tests for adopting a local board into a synced graph (local → synced).

Exercises the real `apply_batch` through the endpoint (no Postgres/Qdrant) via
a recording store, so we assert the whole path: existence/ownership gating,
graph creation with the client UID + owner, and content rebuild from wire ops.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

import topix.api.router.boards as boards_module

from topix.api.router.boards import router
from topix.api.utils.security import get_current_user_uid
from topix.datatypes.graph.graph import Graph
from topix.datatypes.user_billing import UserBilling


class _AdoptStore:
    """Fake GraphStore: gates on metadata/role and records adopt writes."""

    def __init__(self, owned_count: int = 0):
        self.metadata: dict[str, Graph] = {}
        self.roles: dict[tuple[str, str], str] = {}
        self.added_graphs: list[tuple[Graph, str]] = []
        self.add_notes_calls: list = []
        self.add_links_calls: list = []
        # Number of boards the caller already OWNS (for the synced-board cap).
        self._owned_count = owned_count

    async def get_graph_metadata(self, graph_uid: str) -> Graph | None:
        return self.metadata.get(graph_uid)

    async def get_graph_role(self, graph_uid: str, user_uid: str) -> str | None:
        return self.roles.get((graph_uid, user_uid))

    async def add_graph(self, graph: Graph, user_uid: str):
        self.added_graphs.append((graph, user_uid))
        self.metadata[graph.uid] = graph
        self.roles[(graph.uid, user_uid)] = "owner"

    async def list_graphs(self, user_uid: str):
        # (graph, role, owner_email) tuples; `_owned_count` owned rows.
        return [(Graph(uid=f"owned-{i}"), "owner", None) for i in range(self._owned_count)]

    # Used by apply_batch's bulk add dispatch (called with nodes=/links= kwargs).
    async def add_notes(self, nodes):
        self.add_notes_calls.append(list(nodes))

    async def add_links(self, links):
        self.add_links_calls.append(list(links))


class _BillingStore:
    """Fake UserBillingStore returning a fixed plan for the caller."""

    def __init__(self, plan: str = "free"):
        self._plan = plan

    async def get_user_billing(self, user_uid: str) -> UserBilling:
        return UserBilling(user_uid=user_uid, plan=self._plan, status="active")


def _client(
    store: _AdoptStore, user_uid: str = "owner-1", plan: str = "free"
) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.graph_store = store
    app.user_billing_store = _BillingStore(plan)

    async def _uid():
        return user_uid

    app.dependency_overrides[get_current_user_uid] = _uid
    return TestClient(app)


def _node_add(node_id: str) -> dict:
    return {
        "type": "node.add",
        "node": {
            "id": node_id, "x": 0, "y": 0, "w": 200, "h": 80, "z": 0, "angle": 0,
            "content": "hi",
            "data": {"noteType": "note", "styleType": "rectangle", "version": 1},
        },
    }


def _edge_add(edge_id: str, src: str, tgt: str) -> dict:
    return {
        "type": "edge.add",
        "edge": {"id": edge_id, "source": {"nodeId": src}, "target": {"nodeId": tgt}},
    }


def test_adopt_new_board_creates_graph_and_rebuilds_content():
    """A fresh UID → graph created under the caller as owner + content applied."""
    store = _AdoptStore()
    client = _client(store, user_uid="owner-1")

    ops = [_node_add("n1"), _node_add("n2"), _edge_add("e1", "n1", "n2")]
    res = client.post(
        "/boards/board-xyz:adopt", json={"ops": ops, "label": "My Board"}
    )

    assert res.status_code == 200
    data = res.json()["data"]
    assert data == {"graph_id": "board-xyz", "adopted": True, "applied": 3}

    # graph created with the CLIENT uid + owner
    assert len(store.added_graphs) == 1
    graph, owner = store.added_graphs[0]
    assert graph.uid == "board-xyz"
    assert graph.label == "My Board"
    assert owner == "owner-1"

    # content rebuilt via apply_batch, client node/edge ids preserved
    notes = [n for call in store.add_notes_calls for n in call]
    links = [ln for call in store.add_links_calls for ln in call]
    assert sorted(n.id for n in notes) == ["n1", "n2"]
    assert [ln.id for ln in links] == ["e1"]
    assert all(n.graph_uid == "board-xyz" for n in notes)


def test_adopt_is_idempotent_for_owner():
    """Re-adopting a board the caller already owns is a no-op (retry-safe)."""
    store = _AdoptStore()
    store.metadata["board-xyz"] = Graph(uid="board-xyz", label="Existing")
    store.roles[("board-xyz", "owner-1")] = "owner"
    client = _client(store, user_uid="owner-1")

    res = client.post("/boards/board-xyz:adopt", json={"ops": [_node_add("n1")]})

    assert res.status_code == 200
    assert res.json()["data"] == {"graph_id": "board-xyz", "adopted": False, "applied": 0}
    # nothing created or applied the second time
    assert store.added_graphs == []
    assert store.add_notes_calls == []


def test_adopt_rejects_uid_owned_by_someone_else():
    """A UID that exists but the caller doesn't own is a 409, never overwritten."""
    store = _AdoptStore()
    store.metadata["board-xyz"] = Graph(uid="board-xyz", label="Someone else's")
    # caller has no role on it
    client = _client(store, user_uid="intruder")

    res = client.post("/boards/board-xyz:adopt", json={"ops": [_node_add("n1")]})

    assert res.status_code == 409
    assert store.added_graphs == []
    assert store.add_notes_calls == []


def test_adopt_rejects_when_free_synced_limit_reached(monkeypatch):
    """A free user at the synced-board cap can't promote another board (402)."""
    monkeypatch.setattr(boards_module, "is_billing_active", lambda: True)
    store = _AdoptStore(owned_count=boards_module.FREE_SYNCED_BOARD_LIMIT)
    client = _client(store, user_uid="owner-1", plan="free")

    res = client.post("/boards/new-board:adopt", json={"ops": [_node_add("n1")]})

    assert res.status_code == 402
    assert store.added_graphs == []  # never created
    assert store.add_notes_calls == []


def test_adopt_allows_paid_plan_over_free_limit(monkeypatch):
    """A paid plan is unlimited: promotion succeeds past the free cap."""
    monkeypatch.setattr(boards_module, "is_billing_active", lambda: True)
    store = _AdoptStore(owned_count=boards_module.FREE_SYNCED_BOARD_LIMIT + 3)
    client = _client(store, user_uid="owner-1", plan="plus")

    res = client.post("/boards/new-board:adopt", json={"ops": [_node_add("n1")]})

    assert res.status_code == 200
    assert res.json()["data"]["adopted"] is True
