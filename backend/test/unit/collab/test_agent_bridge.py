"""Tests for AgentBoardBridge.

Server-side mutations should both persist via GraphStore *and*
broadcast a `peer-op` to live peers in the relevant Room.
"""

import asyncio
import json

from typing import Any

from topix.collab.agent_bridge import AGENT_CLIENT_ID, AgentBoardBridge
from topix.collab.room import RoomRegistry
from topix.datatypes.note.link import Link
from topix.datatypes.note.note import Note, NoteProperties
from topix.datatypes.property import SizeProperty
from topix.datatypes.resource import RichText


class _FakeSocket:
    def __init__(self):
        """Init."""
        self.sent: list[str] = []

    async def send_text(self, raw: str) -> None:
        """Send text."""
        self.sent.append(raw)


class _RecordingGraphStore:
    """Records each backing call for the bridge's persist step."""

    def __init__(self):
        """Init."""
        self.add_notes_calls: list[list[Note]] = []
        self.patch_calls: list[dict[str, Any]] = []
        self.delete_node_calls: list[dict[str, Any]] = []
        self.add_links_calls: list[list[Link]] = []
        self.delete_link_calls: list[str] = []
        # patch_note returns the post-merge note; we just echo the
        # data dict back wrapped in a Note for tests to inspect.
        self.patch_returns: Note | None = None
        # nodes_by_uid powers get_nodes() — tests that exercise the
        # bridge's edge-endpoint resolver populate this.
        self.nodes_by_uid: dict[str, Note] = {}

    async def add_notes(self, *, nodes):
        """Add notes."""
        self.add_notes_calls.append(nodes)

    async def patch_note(self, *, node_id, data, user_uid):
        """Patch note."""
        self.patch_calls.append({"node_id": node_id, "data": data, "user_uid": user_uid})
        return self.patch_returns or Note(id=node_id, graph_uid="b1")

    async def delete_node(self, *, node_id, user_uid):
        """Delete node."""
        self.delete_node_calls.append({"node_id": node_id, "user_uid": user_uid})

    async def add_links(self, *, links):
        """Add links."""
        self.add_links_calls.append(links)

    async def delete_link(self, *, link_id):
        """Delete link."""
        self.delete_link_calls.append(link_id)

    async def get_nodes(self, node_ids):
        """Return the requested notes (used by the bridge's endpoint resolver)."""
        return [self.nodes_by_uid[uid] for uid in node_ids if uid in self.nodes_by_uid]


def _make_note(note_id: str = "n1", *, w: float | None = None, h: float | None = None) -> Note:
    """Build a Note for tests.

    Optionally seeds `node_size` for the endpoint-resolver path in
    `bridge.add_links`.
    """
    properties = None
    if w is not None or h is not None:
        properties = NoteProperties(
            node_size=SizeProperty(size=SizeProperty.Size(width=w or 300, height=h or 100)),
        )
    return Note(
        id=note_id,
        graph_uid="b1",
        label=RichText(markdown="Hi"),
        content=RichText(markdown="body"),
        properties=properties or NoteProperties(),
    )


async def test_add_notes_persists_and_broadcasts_when_room_exists():
    """Add notes persists and broadcasts when room exists."""
    registry = RoomRegistry()
    store = _RecordingGraphStore()
    bridge = AgentBoardBridge(graph_store=store, registry=registry)

    # Pre-seed a room with one connected client.
    sock = _FakeSocket()
    room, _ = await registry.join("b1", sock, "u1")

    note = _make_note()
    await bridge.add_notes(board_id="b1", notes=[note])

    # Persisted via GraphStore
    assert store.add_notes_calls == [[note]]
    # Broadcast as peer-op to the connected client
    assert len(sock.sent) == 1
    msg = json.loads(sock.sent[0])
    assert msg["kind"] == "peer-op"
    assert msg["seq"] == 1
    assert msg["batch"]["clientId"] == AGENT_CLIENT_ID
    assert msg["batch"]["is_system"] is True
    assert msg["batch"]["origin"] == "remote"
    assert len(msg["batch"]["ops"]) == 1
    assert msg["batch"]["ops"][0]["type"] == "node.add"
    assert msg["batch"]["ops"][0]["node"]["id"] == "n1"


async def test_no_broadcast_when_no_room_exists():
    """With no live session, only the persist step runs."""
    registry = RoomRegistry()
    store = _RecordingGraphStore()
    bridge = AgentBoardBridge(graph_store=store, registry=registry)

    note = _make_note()
    await bridge.add_notes(board_id="b1", notes=[note])

    assert store.add_notes_calls == [[note]]
    assert registry.get("b1") is None


async def test_patch_note_broadcasts_node_update():
    """Patch note broadcasts node update."""
    registry = RoomRegistry()
    store = _RecordingGraphStore()
    bridge = AgentBoardBridge(graph_store=store, registry=registry)

    sock = _FakeSocket()
    await registry.join("b1", sock, "u1")

    await bridge.patch_note(
        board_id="b1",
        node_id="n1",
        data={
            "properties": {
                "node_position": {
                    "type": "position",
                    "position": {"x": 200, "y": 150},
                }
            }
        },
        user_uid=None,
    )

    assert len(store.patch_calls) == 1
    msg = json.loads(sock.sent[0])
    assert msg["batch"]["ops"][0]["type"] == "node.update"
    assert msg["batch"]["ops"][0]["id"] == "n1"
    assert msg["batch"]["ops"][0]["patch"] == {"x": 200.0, "y": 150.0}


async def test_patch_note_with_unsupported_patch_still_persists():
    """Patch with no scene-graph fields persists but skips the broadcast.

    Such a patch produces an empty wire patch, so the bridge sends no
    `peer-op` (no observable op for peers).
    """
    registry = RoomRegistry()
    store = _RecordingGraphStore()
    bridge = AgentBoardBridge(graph_store=store, registry=registry)

    sock = _FakeSocket()
    await registry.join("b1", sock, "u1")

    await bridge.patch_note(
        board_id="b1",
        node_id="n1",
        data={"style": {"fontFamily": "serif"}},
        user_uid=None,
    )

    assert len(store.patch_calls) == 1
    # No wire patch fields → no peer-op
    assert sock.sent == []


async def test_delete_node_broadcasts_node_remove():
    """Delete node broadcasts node remove."""
    registry = RoomRegistry()
    store = _RecordingGraphStore()
    bridge = AgentBoardBridge(graph_store=store, registry=registry)

    sock = _FakeSocket()
    await registry.join("b1", sock, "u1")

    await bridge.delete_node(board_id="b1", node_id="n9", user_uid="u1")

    assert store.delete_node_calls == [{"node_id": "n9", "user_uid": "u1"}]
    msg = json.loads(sock.sent[0])
    assert msg["batch"]["ops"][0] == {"type": "node.remove", "node": {"id": "n9"}}


async def test_add_links_broadcasts_edge_add():
    """add_links broadcasts edge.add with localOffset defaulted to node center.

    Without `localOffset`, canvas-harness's projectEndToWorld crashes
    on `undefined.x`. The bridge resolves source/target node sizes
    via get_nodes and defaults the offset to `(w/2, h/2)`.
    """
    registry = RoomRegistry()
    store = _RecordingGraphStore()
    # Seed the recording store with notes whose node_size we can
    # exercise in the resolver.
    store.nodes_by_uid["a"] = _make_note("a", w=200, h=100)
    store.nodes_by_uid["b"] = _make_note("b", w=400, h=80)
    bridge = AgentBoardBridge(graph_store=store, registry=registry)

    sock = _FakeSocket()
    await registry.join("b1", sock, "u1")

    link = Link(source="a", target="b", graph_uid="b1")
    await bridge.add_links(board_id="b1", links=[link])

    assert store.add_links_calls == [[link]]
    msg = json.loads(sock.sent[0])
    op = msg["batch"]["ops"][0]
    assert op["type"] == "edge.add"
    assert op["edge"]["source"] == {
        "nodeId": "a",
        "localOffset": {"x": 100.0, "y": 50.0},
    }
    assert op["edge"]["target"] == {
        "nodeId": "b",
        "localOffset": {"x": 200.0, "y": 40.0},
    }


async def test_add_links_falls_back_to_zero_offset_when_node_missing():
    """If `get_nodes` doesn't return a node, localOffset falls back to (0, 0).

    Avoids crashing the wire path when an agent emits a link to a node
    the server can't immediately resolve (race / inconsistent state).
    """
    registry = RoomRegistry()
    store = _RecordingGraphStore()  # nodes_by_uid intentionally empty
    bridge = AgentBoardBridge(graph_store=store, registry=registry)

    sock = _FakeSocket()
    await registry.join("b1", sock, "u1")

    link = Link(source="missing", target="also-missing", graph_uid="b1")
    await bridge.add_links(board_id="b1", links=[link])

    msg = json.loads(sock.sent[0])
    op = msg["batch"]["ops"][0]
    assert op["edge"]["source"] == {
        "nodeId": "missing",
        "localOffset": {"x": 0.0, "y": 0.0},
    }
    assert op["edge"]["target"] == {
        "nodeId": "also-missing",
        "localOffset": {"x": 0.0, "y": 0.0},
    }


async def test_seq_is_monotonic_per_room():
    """Seq is monotonic per room."""
    registry = RoomRegistry()
    store = _RecordingGraphStore()
    bridge = AgentBoardBridge(graph_store=store, registry=registry)

    sock = _FakeSocket()
    await registry.join("b1", sock, "u1")

    await bridge.add_notes(board_id="b1", notes=[_make_note("n1")])
    await bridge.delete_node(board_id="b1", node_id="n1", user_uid="u1")
    await bridge.add_notes(board_id="b1", notes=[_make_note("n2")])

    seqs = [json.loads(s)["seq"] for s in sock.sent]
    assert seqs == [1, 2, 3]


async def test_broadcast_runs_under_same_lock_as_seq_assignment():
    """Concurrent bridge calls must serialize cleanly.

    Strictly increasing seqs and per-peer-ordered peer-op frames.
    """
    registry = RoomRegistry()
    store = _RecordingGraphStore()
    bridge = AgentBoardBridge(graph_store=store, registry=registry)

    sock = _FakeSocket()
    await registry.join("b1", sock, "u1")

    await asyncio.gather(*[
        bridge.delete_node(board_id="b1", node_id=f"n{i}", user_uid="u1")
        for i in range(10)
    ])

    seqs = [json.loads(s)["seq"] for s in sock.sent]
    assert seqs == sorted(seqs)
    assert seqs[0] == 1
    assert seqs[-1] == 10
