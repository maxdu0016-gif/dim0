"""Server-side op applier — translates canvas-harness wire ops into
existing `GraphStore` mutations.

Scope (Phase 1b first cut):
  - node.update for the scene-graph primitives (x, y, w, h, z, angle,
    content). Covers drag, resize, z-order, rotate, text-edit — the
    bulk of collab traffic.
  - node.remove — id-only delete.
  - node.add — minimal conversion that round-trips through the existing
    Note model. Style/data nuances delegated to the existing pydantic
    defaults; richer fidelity lands as deepenings.
  - edge.add / edge.update / edge.remove — the Link analogues.

Deferred (still log + return `unsupported`):
  - Full `style` / `data` translation for `node.update` / `node.add`.
    The relay still broadcasts the op to peers; the server just doesn't
    persist the unsupported fields yet.
  - `group.upsert` / `group.remove` (Dim0 doesn't surface groups yet).
  - `frame.reorder` (z-shuffle of multiple ids in one op).
"""

import logging
import math
from typing import Any, Literal

from pydantic import BaseModel

from topix.datatypes.note.link import Link
from topix.datatypes.note.note import Note
from topix.store.graph import GraphStore


logger = logging.getLogger(__name__)


RAD_TO_DEG = 180.0 / math.pi


class WireOpResult(BaseModel):
    """Outcome of applying one op. `applied=True` means the DB write
    happened; `applied=False` means the op was unsupported but the
    relay should still broadcast it to peers (best-effort)."""

    applied: bool
    op_type: str
    reason: str | None = None


async def apply_batch(
    *,
    graph_store: GraphStore,
    board_id: str,
    user_id: str,
    ops: list[dict[str, Any]],
) -> list[WireOpResult]:
    """Apply a batch of wire ops in order. Returns one result per op."""
    results: list[WireOpResult] = []
    for op in ops:
        op_type = op.get("type", "")
        try:
            result = await _apply_one(
                graph_store=graph_store,
                board_id=board_id,
                user_id=user_id,
                op=op,
            )
        except Exception as exc:
            logger.exception("collab apply error type=%s err=%s", op_type, exc)
            result = WireOpResult(applied=False, op_type=op_type, reason=str(exc))
        results.append(result)
    return results


async def _apply_one(
    *,
    graph_store: GraphStore,
    board_id: str,
    user_id: str,
    op: dict[str, Any],
) -> WireOpResult:
    op_type = op.get("type", "")

    if op_type == "node.update":
        node_id = op.get("id")
        patch = op.get("patch") or {}
        if not isinstance(node_id, str):
            return WireOpResult(applied=False, op_type=op_type, reason="missing id")
        data = _node_patch_to_note_data(patch)
        if not data:
            return WireOpResult(applied=False, op_type=op_type, reason="no supported fields in patch")
        await graph_store.patch_note(node_id=node_id, data=data, user_uid=user_id)
        return WireOpResult(applied=True, op_type=op_type)

    if op_type == "node.remove":
        node = op.get("node") or {}
        node_id = node.get("id") or op.get("id")
        if not isinstance(node_id, str):
            return WireOpResult(applied=False, op_type=op_type, reason="missing id")
        await graph_store.delete_node(node_id=node_id, user_uid=user_id)
        return WireOpResult(applied=True, op_type=op_type)

    if op_type == "node.add":
        node = op.get("node") or {}
        note = _wire_node_to_note(node, board_id=board_id)
        if note is None:
            return WireOpResult(applied=False, op_type=op_type, reason="could not construct Note")
        await graph_store.add_notes(nodes=[note])
        return WireOpResult(applied=True, op_type=op_type)

    if op_type == "edge.add":
        edge = op.get("edge") or {}
        link = _wire_edge_to_link(edge, board_id=board_id)
        if link is None:
            return WireOpResult(applied=False, op_type=op_type, reason="could not construct Link")
        await graph_store.add_links(links=[link])
        return WireOpResult(applied=True, op_type=op_type)

    if op_type == "edge.update":
        link_id = op.get("id")
        patch = op.get("patch") or {}
        if not isinstance(link_id, str):
            return WireOpResult(applied=False, op_type=op_type, reason="missing id")
        data = _edge_patch_to_link_data(patch)
        if not data:
            return WireOpResult(applied=False, op_type=op_type, reason="no supported fields in patch")
        await graph_store.update_link(link_id=link_id, data=data)
        return WireOpResult(applied=True, op_type=op_type)

    if op_type == "edge.remove":
        edge = op.get("edge") or {}
        link_id = edge.get("id") or op.get("id")
        if not isinstance(link_id, str):
            return WireOpResult(applied=False, op_type=op_type, reason="missing id")
        await graph_store.delete_link(link_id=link_id)
        return WireOpResult(applied=True, op_type=op_type)

    # Deferred: group.upsert, group.remove, frame.reorder.
    logger.info("collab unsupported op type=%s — relayed but not persisted", op_type)
    return WireOpResult(applied=False, op_type=op_type, reason="unsupported op type")


# ---------------------------------------------------------------------------
# Wire → DB translation helpers
# ---------------------------------------------------------------------------


def _node_patch_to_note_data(patch: dict[str, Any]) -> dict[str, Any]:
    """Convert a canvas-harness `Partial<Node>` patch into the snake_case
    Note patch dict that `graph_store.patch_note` expects.

    Only handles the scene-graph primitives that ship in Phase 1b's first
    cut. Style / data depth lands incrementally.
    """
    properties: dict[str, Any] = {}
    if "x" in patch or "y" in patch:
        properties["node_position"] = {
            "type": "position",
            "position": {
                "x": float(patch.get("x", 0)),
                "y": float(patch.get("y", 0)),
            },
        }
    if "w" in patch or "h" in patch:
        properties["node_size"] = {
            "type": "size",
            "size": {
                "width": float(patch.get("w", 0)),
                "height": float(patch.get("h", 0)),
            },
        }
    if "z" in patch:
        properties["node_z_index"] = {
            "type": "number",
            "number": float(patch["z"]),
        }

    data: dict[str, Any] = {}
    if properties:
        data["properties"] = properties
    if "angle" in patch:
        data.setdefault("style", {})["angle"] = float(patch["angle"]) * RAD_TO_DEG
    if "content" in patch:
        data["content"] = {"markdown": str(patch["content"] or "")}
    return data


def _wire_node_to_note(node: dict[str, Any], *, board_id: str) -> Note | None:
    """Construct a server-side `Note` from a wire `Node` payload.

    Lossy on first pass: style / data are mostly defaulted by the Note
    model. Position + size + content + the discriminator carry through.
    """
    node_id = node.get("id")
    if not isinstance(node_id, str):
        return None

    data_field = node.get("data") or {}
    properties = _node_patch_to_note_data(node).get("properties", {})

    note_dict: dict[str, Any] = {
        "id": node_id,
        "graph_uid": board_id,
        "type": data_field.get("noteType", "note"),
        "version": data_field.get("version", 1),
        "parent_id": data_field.get("parentId"),
        "properties": properties,
    }
    if "content" in node:
        note_dict["content"] = {"markdown": str(node["content"] or "")}

    style_type = data_field.get("styleType")
    if style_type:
        note_dict["style"] = {"type": style_type}
    angle = node.get("angle")
    if angle is not None:
        note_dict.setdefault("style", {})["angle"] = float(angle) * RAD_TO_DEG

    try:
        return Note.model_validate(note_dict)
    except Exception:
        logger.exception("collab failed to build Note id=%s", node_id)
        return None


def _wire_edge_to_link(edge: dict[str, Any], *, board_id: str) -> Link | None:
    """Construct a `Link` from a wire `Edge` payload (best-effort).

    Canvas-harness Edges carry `source: { nodeId }` / `target: { nodeId }`
    endpoints; Dim0 stores them as flat node-id strings on `Link.source`
    / `Link.target`.
    """
    link_id = edge.get("id")
    if not isinstance(link_id, str):
        return None

    src = edge.get("source") or {}
    dst = edge.get("target") or {}

    source_id = src.get("nodeId") or edge.get("sourceId")
    target_id = dst.get("nodeId") or edge.get("targetId")
    if not source_id or not target_id:
        return None

    try:
        return Link.model_validate({
            "id": link_id,
            "graph_uid": board_id,
            "source": source_id,
            "target": target_id,
        })
    except Exception:
        logger.exception("collab failed to build Link id=%s", link_id)
        return None


def _edge_patch_to_link_data(patch: dict[str, Any]) -> dict[str, Any]:
    """Translate `Partial<Edge>` to a `update_link` data dict.

    Today only handles endpoint changes — style / label / path style are
    deferred to a follow-up.
    """
    data: dict[str, Any] = {}
    src = patch.get("source")
    if isinstance(src, dict) and "nodeId" in src:
        data["source"] = src["nodeId"]
    dst = patch.get("target")
    if isinstance(dst, dict) and "nodeId" in dst:
        data["target"] = dst["nodeId"]
    return data


# Type alias for places that want to talk about a single op_type literal.
WireOpType = Literal[
    "node.add",
    "node.update",
    "node.remove",
    "edge.add",
    "edge.update",
    "edge.remove",
    "group.upsert",
    "group.remove",
    "frame.reorder",
]
