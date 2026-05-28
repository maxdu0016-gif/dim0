"""Unit tests for the server-side op applier.

Mocks the GraphStore so each canvas-harness Op kind can be exercised
without Postgres/Qdrant.
"""

import math

from topix.collab.apply_ops import RAD_TO_DEG, apply_batch


class _RecordingGraphStore:
    """Records the args of each GraphStore call so tests can assert."""

    def __init__(self):
        """Init."""
        self.add_notes_calls: list = []
        self.patch_calls: list = []
        self.delete_node_calls: list = []
        self.add_links_calls: list = []
        self.update_link_calls: list = []
        self.delete_link_calls: list = []

    async def add_notes(self, nodes):
        """Add notes."""
        self.add_notes_calls.append(nodes)

    async def patch_note(self, node_id, data, user_uid):
        """Patch note."""
        self.patch_calls.append({"node_id": node_id, "data": data, "user_uid": user_uid})

    async def delete_node(self, node_id, user_uid):
        """Delete node."""
        self.delete_node_calls.append({"node_id": node_id, "user_uid": user_uid})

    async def add_links(self, links):
        """Add links."""
        self.add_links_calls.append(links)

    async def update_link(self, link_id, data):
        """Update link."""
        self.update_link_calls.append({"link_id": link_id, "data": data})

    async def delete_link(self, link_id):
        """Delete link."""
        self.delete_link_calls.append(link_id)


# ---------------------------------------------------------------------------
# node.update
# ---------------------------------------------------------------------------

async def test_node_update_position_only():
    """Node update position only."""
    store = _RecordingGraphStore()
    op = {"type": "node.update", "id": "n1", "patch": {"x": 200, "y": 150}, "prev": {}}

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    assert store.patch_calls == [{
        "node_id": "n1",
        "user_uid": "u1",
        "data": {
            "properties": {
                "node_position": {
                    "type": "position",
                    "position": {"x": 200.0, "y": 150.0},
                },
            },
        },
    }]


async def test_node_update_resize_emits_node_size():
    """Node update resize emits node size."""
    store = _RecordingGraphStore()
    op = {"type": "node.update", "id": "n1", "patch": {"w": 400, "h": 250}, "prev": {}}

    await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert store.patch_calls[0]["data"] == {
        "properties": {
            "node_size": {"type": "size", "size": {"width": 400.0, "height": 250.0}},
        },
    }


async def test_node_update_z_index():
    """Node update z index."""
    store = _RecordingGraphStore()
    op = {"type": "node.update", "id": "n1", "patch": {"z": 42}, "prev": {}}

    await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert store.patch_calls[0]["data"] == {
        "properties": {"node_z_index": {"type": "number", "number": 42.0}},
    }


async def test_node_update_angle_converts_radians_to_degrees():
    """Node update angle converts radians to degrees."""
    store = _RecordingGraphStore()
    op = {"type": "node.update", "id": "n1", "patch": {"angle": math.pi / 2}, "prev": {}}

    await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert store.patch_calls[0]["data"]["style"]["angle"] == (math.pi / 2) * RAD_TO_DEG


async def test_node_update_content_writes_to_content_markdown():
    """Node update content writes to content markdown."""
    store = _RecordingGraphStore()
    op = {"type": "node.update", "id": "n1", "patch": {"content": "# Hi"}, "prev": {}}

    await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert store.patch_calls[0]["data"]["content"] == {"markdown": "# Hi"}


async def test_node_update_with_no_supported_fields_is_not_applied():
    """Node update with no supported fields is not applied."""
    store = _RecordingGraphStore()
    # `style: {fontFamily: ...}` — not yet supported by the first cut.
    op = {"type": "node.update", "id": "n1", "patch": {"style": {"fontFamily": "serif"}}, "prev": {}}

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is False
    assert store.patch_calls == []


# ---------------------------------------------------------------------------
# node.remove
# ---------------------------------------------------------------------------

async def test_node_remove_dispatches_to_delete_node():
    """Node remove dispatches to delete node."""
    store = _RecordingGraphStore()
    op = {"type": "node.remove", "node": {"id": "n1"}}

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    assert store.delete_node_calls == [{"node_id": "n1", "user_uid": "u1"}]


async def test_node_remove_missing_id_is_rejected():
    """Node remove missing id is rejected."""
    store = _RecordingGraphStore()
    op = {"type": "node.remove", "node": {}}

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is False
    assert store.delete_node_calls == []


# ---------------------------------------------------------------------------
# node.add
# ---------------------------------------------------------------------------

async def test_node_add_constructs_note_with_board_id_and_position():
    """Node add constructs note with board id and position."""
    store = _RecordingGraphStore()
    op = {
        "type": "node.add",
        "node": {
            "id": "n1",
            "x": 100, "y": 100, "w": 200, "h": 80, "z": 0,
            "angle": 0,
            "content": "hello",
            "data": {"noteType": "note", "styleType": "rectangle", "version": 1},
        },
    }

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    assert len(store.add_notes_calls) == 1
    [note] = store.add_notes_calls[0]
    assert note.id == "n1"
    assert note.graph_uid == "b1"
    assert note.content.markdown == "hello"
    pos = note.properties.node_position.position
    assert (pos.x, pos.y) == (100.0, 100.0)


# ---------------------------------------------------------------------------
# edge.* — Link round-trip
# ---------------------------------------------------------------------------

async def test_edge_add_constructs_link_with_endpoints():
    """Edge add constructs link with endpoints."""
    store = _RecordingGraphStore()
    op = {
        "type": "edge.add",
        "edge": {
            "id": "e1",
            "source": {"nodeId": "n1"},
            "target": {"nodeId": "n2"},
        },
    }

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    [link] = store.add_links_calls[0]
    assert link.id == "e1"
    assert link.graph_uid == "b1"
    assert link.source == "n1"
    assert link.target == "n2"


async def test_edge_remove_dispatches_to_delete_link():
    """Edge remove dispatches to delete link."""
    store = _RecordingGraphStore()
    op = {"type": "edge.remove", "edge": {"id": "e1"}}

    await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert store.delete_link_calls == ["e1"]


async def test_edge_update_endpoint_change():
    """Edge update endpoint change."""
    store = _RecordingGraphStore()
    op = {
        "type": "edge.update",
        "id": "e1",
        "patch": {"target": {"nodeId": "n3"}},
        "prev": {},
    }

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    assert store.update_link_calls == [{"link_id": "e1", "data": {"target": "n3"}}]


# ---------------------------------------------------------------------------
# Unsupported / batch behaviour
# ---------------------------------------------------------------------------

async def test_unsupported_op_does_not_apply_but_does_not_raise():
    """Unsupported op does not apply but does not raise."""
    store = _RecordingGraphStore()
    op = {"type": "group.upsert", "group": {"id": "g1"}}

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is False
    assert results[0].reason == "unsupported op type"


async def test_batch_keeps_processing_after_a_single_op_fails():
    """Batch keeps processing after a single op fails."""
    store = _RecordingGraphStore()
    ops = [
        {"type": "node.update", "id": "n1", "patch": {"x": 1, "y": 2}, "prev": {}},
        {"type": "group.upsert", "group": {"id": "g1"}},  # unsupported
        {"type": "node.remove", "node": {"id": "n2"}},
    ]

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=ops)

    assert [r.applied for r in results] == [True, False, True]
    assert len(store.patch_calls) == 1
    assert len(store.delete_node_calls) == 1


async def test_op_handler_exception_is_caught_per_op():
    """Backing store exceptions are caught per op; batch continues.

    A raising op records as `applied=False` with the exception
    message; subsequent ops are still applied.
    """

    class _BoomStore(_RecordingGraphStore):
        async def patch_note(self, node_id, data, user_uid):
            """Patch note."""
            raise RuntimeError("db down")

    store = _BoomStore()
    ops = [
        {"type": "node.update", "id": "n1", "patch": {"x": 1, "y": 2}, "prev": {}},
        {"type": "node.remove", "node": {"id": "n2"}},
    ]

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=ops)

    assert results[0].applied is False
    assert results[0].reason and "db down" in results[0].reason
    assert results[1].applied is True
