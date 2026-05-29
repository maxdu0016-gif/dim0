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


async def test_node_update_colors_persist_from_stored_colors():
    """Colors persist from data._storedColors, not from `style.*`.

    The picker writes canonical hex into `data._storedColors`; the
    wire's `style.*` carries a (possibly dark-adapted) display value
    we deliberately ignore on the server.
    """
    store = _RecordingGraphStore()
    op = {
        "type": "node.update",
        "id": "n1",
        "patch": {
            # `style` here carries the SENDER's display-adapted hex
            # (could be dark-mode). We deliberately ignore it.
            "style": {"backgroundColor": "#1A2C5C"},
            "data": {
                "_storedColors": {
                    "backgroundColor": "#3b82f6",
                    "strokeColor": "#1e3a8a",
                    "textColor": "#0a0a0a",
                },
            },
        },
        "prev": {},
    }

    await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    style = store.patch_calls[0]["data"]["style"]
    assert style["background_color"] == "#3b82f6"
    assert style["stroke_color"] == "#1e3a8a"
    assert style["text_color"] == "#0a0a0a"


async def test_node_update_without_stored_colors_does_not_emit_style_colors():
    """Position-only patches don't emit a style update.

    Without this, the embed-skip fast path in patch_note would
    accidentally see a non-empty style dict and take the slow path.
    """
    store = _RecordingGraphStore()
    op = {"type": "node.update", "id": "n1", "patch": {"x": 1, "y": 2}, "prev": {}}

    await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert "style" not in store.patch_calls[0]["data"]


async def test_node_add_carries_stored_colors_onto_style():
    """`node.add` mirrors `node.update` for color persistence.

    Canonical colors come from `data._storedColors`, not from the
    (possibly dark-adapted) `node.style` field.
    """
    store = _RecordingGraphStore()
    op = {
        "type": "node.add",
        "node": {
            "id": "n1", "x": 0, "y": 0, "w": 200, "h": 80, "z": 0, "angle": 0,
            "content": "",
            "style": {"backgroundColor": "#1A2C5C"},
            "data": {
                "noteType": "note", "styleType": "rectangle", "version": 1,
                "_storedColors": {"backgroundColor": "#3b82f6"},
            },
        },
    }

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    [note] = store.add_notes_calls[0]
    assert note.style.background_color == "#3b82f6"


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


async def test_node_add_falls_back_to_wire_type_when_style_type_missing():
    """When `data.styleType` is absent, translate the wire `type` back to Dim0.

    Defense-in-depth: a legacy / buggy client could ship a wire `node.add`
    without `data.styleType`. Without this fallback, the persisted Note's
    `style.type` would default to `"rectangle"` (Dim0 default) even when
    the wire said `type="ellipse"` — a silent data corruption that
    breaks REST round-trip on the next snapshot load.
    """
    store = _RecordingGraphStore()
    op = {
        "type": "node.add",
        "node": {
            "id": "n1",
            "x": 0, "y": 0, "w": 200, "h": 80, "z": 0,
            "angle": 0,
            # NB: `type` uses canvas-harness vocabulary; `data.styleType`
            # is intentionally omitted to exercise the fallback.
            "type": "ellipse",
            "data": {"noteType": "note", "version": 1},
        },
    }

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    [note] = store.add_notes_calls[0]
    assert note.style.type == "ellipse"


async def test_node_add_wire_type_rect_maps_back_to_rectangle():
    """`type="rect"` (canvas-harness) → `style.type = "rectangle"` (Dim0).

    Inverse of the four shape renames in `_DIM0_TO_CANVAS_TYPE`.
    """
    store = _RecordingGraphStore()
    op = {
        "type": "node.add",
        "node": {
            "id": "n1",
            "x": 0, "y": 0, "w": 200, "h": 80, "z": 0,
            "angle": 0,
            "type": "rect",
            "data": {"noteType": "note", "version": 1},
        },
    }

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    [note] = store.add_notes_calls[0]
    assert note.style.type == "rectangle"


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


async def test_edge_update_persists_midpoint_to_control_point():
    """Edge curve adjustments persist as `properties.edge_control_point`.

    The wire carries a `_midpoint` field (the client computes it from
    cubic-bezier control points before sending) so the server stays
    stateless — no node-position lookup needed.
    """
    store = _RecordingGraphStore()
    op = {
        "type": "edge.update",
        "id": "e1",
        "patch": {
            # canvas-harness Edge.control stays on the wire for peers
            # to paint with; the server ignores it.
            "control": [{"x": 50, "y": 10}, {"x": 50, "y": 10}],
            "_midpoint": {"x": 50, "y": 25},
        },
        "prev": {},
    }

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    expected = {
        "properties": {
            "edge_control_point": {
                "type": "position",
                "position": {"x": 50.0, "y": 25.0},
            },
        },
    }
    assert store.update_link_calls == [{"link_id": "e1", "data": expected}]


async def test_edge_add_persists_label_and_style_and_path_style():
    """An edge.add with content + style + pathStyle round-trips into the Link.

    Mirrors the client's outbound wire shape (camelCase EdgeStyle); the
    server snake_cases the fields back onto `LinkStyle` and saves
    `content` as `Link.label.markdown`.
    """
    store = _RecordingGraphStore()
    op = {
        "type": "edge.add",
        "edge": {
            "id": "e1",
            "source": {"nodeId": "n1"},
            "target": {"nodeId": "n2"},
            "pathStyle": "straight",
            "content": "labeled edge",
            "style": {
                "strokeColor": "#ff0000",
                "strokeWidth": 3,
                "strokeStyle": "dashed",
                "sourceArrowhead": "barb",
                "targetArrowhead": "arrow-filled",
            },
        },
    }

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    [link] = store.add_links_calls[0]
    assert link.label is not None
    assert link.label.markdown == "labeled edge"
    assert link.style.path_style == "straight"
    assert link.style.stroke_color == "#ff0000"
    assert link.style.stroke_width == 3
    assert link.style.stroke_style == "dashed"
    assert link.style.source_arrowhead == "barb"
    assert link.style.target_arrowhead == "arrow-filled"


async def test_edge_update_persists_label_and_path_style():
    """An edge.update with content + pathStyle propagates to update_link.

    `content` becomes `label.markdown`; `pathStyle` ends up nested under
    the `style` patch dict (snake_case).
    """
    store = _RecordingGraphStore()
    op = {
        "type": "edge.update",
        "id": "e1",
        "patch": {
            "content": "renamed",
            "pathStyle": "polyline",
            "style": {"textColor": "#222222"},
        },
        "prev": {},
    }

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    [call] = store.update_link_calls
    assert call["link_id"] == "e1"
    assert call["data"]["label"] == {"markdown": "renamed"}
    assert call["data"]["style"] == {
        "path_style": "polyline",
        "text_color": "#222222",
    }


async def test_edge_update_clears_label_when_content_empty():
    """An empty `content` patch clears the label (deep-merge sets None)."""
    store = _RecordingGraphStore()
    op = {
        "type": "edge.update",
        "id": "e1",
        "patch": {"content": ""},
        "prev": {},
    }

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    [call] = store.update_link_calls
    assert call["data"]["label"] is None


async def test_edge_add_pulls_canonical_colors_from_stored_colors():
    """`data._storedColors` on edge.add overrides display-adapted style colors.

    Symmetric to the node-side `_storedColors` handling — keeps the
    user's canonical pick in the DB regardless of the sender's theme.
    """
    store = _RecordingGraphStore()
    op = {
        "type": "edge.add",
        "edge": {
            "id": "e1",
            "source": {"nodeId": "n1"},
            "target": {"nodeId": "n2"},
            "style": {"strokeColor": "#display-adapted"},
            "data": {
                "_storedColors": {
                    "strokeColor": "#0a0a0a",
                    "textColor": "#111111",
                },
            },
        },
    }

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    [link] = store.add_links_calls[0]
    assert link.style.stroke_color == "#0a0a0a"
    assert link.style.text_color == "#111111"


async def test_edge_add_persists_attached_endpoint_local_offset():
    """A user-drawn edge stores its `localOffset` so it doesn't snap to center.

    Regression: the inbound WS path used to read only `nodeId` from the
    endpoint, dropping `localOffset` on the floor. On the next reload
    `linkToEdge` then fell through to the (w/2, h/2) default and every
    edge endpoint snapped to the node's center — the bug surfaced from
    smoke testing after collab became the sole writer.
    """
    store = _RecordingGraphStore()
    op = {
        "type": "edge.add",
        "edge": {
            "id": "e1",
            "source": {"nodeId": "n1", "localOffset": {"x": 50, "y": 30}},
            "target": {"nodeId": "n2", "localOffset": {"x": 180, "y": 10}},
        },
    }

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    [link] = store.add_links_calls[0]
    assert link.source == "n1"
    assert link.target == "n2"
    # `is_local_offset` is set on both endpoints — disambiguates from
    # the legacy world-coord interpretation when read back.
    assert link.properties.start_point.is_local_offset is True
    assert link.properties.start_point.position.x == 50.0
    assert link.properties.start_point.position.y == 30.0
    assert link.properties.end_point.is_local_offset is True
    assert link.properties.end_point.position.x == 180.0
    assert link.properties.end_point.position.y == 10.0


async def test_edge_add_persists_free_endpoint_world_point():
    """A free-floating endpoint persists as `source == ""` + world-coord position.

    Inbound WS used to reject free endpoints entirely (no `nodeId` →
    early return). Now we flatten them to the empty-string sentinel +
    world-coord `start_point`/`end_point` with `is_local_offset=False`,
    matching the REST round-trip convention.
    """
    store = _RecordingGraphStore()
    op = {
        "type": "edge.add",
        "edge": {
            "id": "e1",
            "source": {"nodeId": "n1", "localOffset": {"x": 100, "y": 50}},
            "target": {"worldPoint": {"x": 800, "y": 400}},
        },
    }

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    [link] = store.add_links_calls[0]
    assert link.source == "n1"
    assert link.target == ""    # empty-string sentinel for free
    assert link.properties.end_point.is_local_offset is False
    assert link.properties.end_point.position.x == 800.0
    assert link.properties.end_point.position.y == 400.0


async def test_edge_update_endpoint_change_carries_local_offset():
    """An `edge.update` that moves an endpoint persists the new `localOffset`.

    Used when the user drags an attached endpoint to a different
    position on the same node (or onto a different node entirely).
    Without this the new position is lost on reload.
    """
    store = _RecordingGraphStore()
    op = {
        "type": "edge.update",
        "id": "e1",
        "patch": {
            "target": {"nodeId": "n3", "localOffset": {"x": 25, "y": 75}},
        },
        "prev": {},
    }

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    [call] = store.update_link_calls
    assert call["data"]["target"] == "n3"
    assert call["data"]["properties"]["end_point"]["position"] == {"x": 25.0, "y": 75.0}
    assert call["data"]["properties"]["end_point"]["is_local_offset"] is True


async def test_edge_add_carries_midpoint_onto_link_properties():
    """A freshly-drawn edge with a curve persists the midpoint on create."""
    store = _RecordingGraphStore()
    op = {
        "type": "edge.add",
        "edge": {
            "id": "e1",
            "source": {"nodeId": "n1"},
            "target": {"nodeId": "n2"},
            "control": [{"x": 100, "y": 50}, {"x": 100, "y": 50}],
            "_midpoint": {"x": 100, "y": 60},
        },
    }

    results = await apply_batch(graph_store=store, board_id="b1", user_id="u1", ops=[op])

    assert results[0].applied is True
    [link] = store.add_links_calls[0]
    assert link.properties.edge_control_point.position.x == 100.0
    assert link.properties.edge_control_point.position.y == 60.0


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
