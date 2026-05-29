"""Server-side op applier.

Translates canvas-harness wire ops into existing `GraphStore`
mutations.

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

from topix.collab.note_to_wire import _CANVAS_TO_DIM0_TYPE
from topix.datatypes.note.link import Link
from topix.datatypes.note.note import Note
from topix.store.graph import GraphStore

logger = logging.getLogger(__name__)


RAD_TO_DEG = 180.0 / math.pi


# Inverse of `_EDGE_STYLE_KEY_MAP` in note_to_wire.py — canvas-harness
# EdgeStyle (camelCase) → Dim0 LinkStyle (snake_case).
_EDGE_STYLE_KEY_MAP_INV: dict[str, str] = {
    "strokeColor": "stroke_color",
    "strokeWidth": "stroke_width",
    "strokeStyle": "stroke_style",
    "backgroundColor": "background_color",
    "roughness": "roughness",
    "roundness": "roundness",
    "opacity": "opacity",
    "fontFamily": "font_family",
    "fontSize": "font_size",
    "textAlign": "text_align",
    "textColor": "text_color",
    "textStyle": "text_style",
    "sourceArrowhead": "source_arrowhead",
    "targetArrowhead": "target_arrowhead",
}


class WireOpResult(BaseModel):
    """Outcome of applying one op.

    `applied=True` means the DB write happened; `applied=False` means
    the op was unsupported but the relay should still broadcast it to
    peers (best-effort).
    """

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


async def _apply_one(  # noqa: C901 — dispatcher across op kinds; readability beats trimming branches
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
    """Convert a canvas-harness `Partial<Node>` patch into a Note patch dict.

    Handles:
      - Scene primitives: `x, y, w, h, z, angle, content`.
      - Colors: pulled from `patch.data._storedColors` (canonical
        light-theme hex; the receiver-side `style.*` carries a
        theme-adapted display value we deliberately ignore).

    Other style/data depth lands incrementally.
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

    style_color = _extract_canonical_colors(patch.get("data"))
    if style_color:
        style = data.setdefault("style", {})
        for k, v in style_color.items():
            style[k] = v
    return data


def _extract_canonical_colors(node_data: Any) -> dict[str, str]:
    """Pull canonical (light-theme) colors out of a wire Node's data.

    Source of truth lives at `data._storedColors` — see
    [webui color-adapter.ts] for the contract. Returns a Dim0-shaped
    (snake_case) subset suitable for merging into `style`. Missing
    fields are simply omitted so the deep-merge on the server side
    leaves untouched colors alone.
    """
    if not isinstance(node_data, dict):
        return {}
    stored = node_data.get("_storedColors")
    if not isinstance(stored, dict):
        return {}
    out: dict[str, str] = {}
    if isinstance(stored.get("backgroundColor"), str):
        out["background_color"] = stored["backgroundColor"]
    if isinstance(stored.get("strokeColor"), str):
        out["stroke_color"] = stored["strokeColor"]
    if isinstance(stored.get("textColor"), str):
        out["text_color"] = stored["textColor"]
    return out


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

    # Prefer `data.styleType` (the Dim0 enum value the client embeds for
    # round-trip fidelity). Fall back to translating the wire `type`
    # (canvas-harness vocabulary) back to Dim0 via the inverse map — keeps
    # `LinkStyle.type` schema-valid if a future op omits styleType.
    style_type = data_field.get("styleType") or _CANVAS_TO_DIM0_TYPE.get(
        str(node.get("type", "")),
    )
    if style_type:
        note_dict["style"] = {"type": style_type}
    angle = node.get("angle")
    if angle is not None:
        note_dict.setdefault("style", {})["angle"] = float(angle) * RAD_TO_DEG

    # Canonical colors from data._storedColors (set by the picker). The
    # wire's `style.*` carries the sender's display-adapted value which
    # we deliberately ignore — see use-ws-collab.ts for the inbound
    # theme normalization on the client side.
    canonical_colors = _extract_canonical_colors(data_field)
    if canonical_colors:
        style = note_dict.setdefault("style", {})
        for k, v in canonical_colors.items():
            style[k] = v

    try:
        return Note.model_validate(note_dict)
    except Exception:
        logger.exception("collab failed to build Note id=%s", node_id)
        return None


def _wire_edge_to_link(edge: dict[str, Any], *, board_id: str) -> Link | None:
    """Construct a `Link` from a wire `Edge` payload (best-effort).

    Canvas-harness Edges carry `source: { nodeId }` / `target: { nodeId }`
    endpoints; Dim0 stores them as flat node-id strings on `Link.source`
    / `Link.target`. We also persist `pathStyle`, edge label (`content`
    → `Link.label.markdown`), and the camelCase EdgeStyle fields the
    client sends.
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

    link_dict: dict[str, Any] = {
        "id": link_id,
        "graph_uid": board_id,
        "source": source_id,
        "target": target_id,
    }
    style = _edge_wire_to_link_style(edge)
    if style:
        link_dict["style"] = style
    label_markdown = edge.get("content")
    if isinstance(label_markdown, str) and label_markdown:
        link_dict["label"] = {"markdown": label_markdown}
    midpoint = _extract_midpoint(edge)
    if midpoint is not None:
        link_dict["properties"] = {"edge_control_point": midpoint}

    try:
        return Link.model_validate(link_dict)
    except Exception:
        logger.exception("collab failed to build Link id=%s", link_id)
        return None


def _edge_patch_to_link_data(patch: dict[str, Any]) -> dict[str, Any]:
    """Translate `Partial<Edge>` to a `update_link` data dict.

    Handles endpoint changes (`source / target`), the curve control
    midpoint (`_midpoint`, computed client-side from the cubic-bezier
    control points before the op is sent — keeps the server stateless,
    no node-position lookup needed), `pathStyle`, edge label
    (`content` → `label.markdown`), and the camelCase EdgeStyle subset.
    """
    data: dict[str, Any] = {}
    src = patch.get("source")
    if isinstance(src, dict) and "nodeId" in src:
        data["source"] = src["nodeId"]
    dst = patch.get("target")
    if isinstance(dst, dict) and "nodeId" in dst:
        data["target"] = dst["nodeId"]

    style = _edge_wire_to_link_style(patch)
    if style:
        data["style"] = style

    if "content" in patch:
        markdown = patch.get("content")
        data["label"] = (
            {"markdown": str(markdown)} if isinstance(markdown, str) and markdown else None
        )

    midpoint = _extract_midpoint(patch)
    if midpoint is not None:
        data.setdefault("properties", {})["edge_control_point"] = midpoint
    return data


def _edge_wire_to_link_style(payload: dict[str, Any]) -> dict[str, Any]:
    """Build a Dim0 LinkStyle patch dict from a wire `Edge` / `Partial<Edge>`.

    Pulls `pathStyle` off the top level (lifted on canvas-harness's
    `Edge`), the camelCase EdgeStyle fields off `style`, and canonical
    colors off `data._storedColors`. Returns an empty dict when nothing
    is set so callers can decide whether to skip the style key.
    """
    out: dict[str, Any] = {}

    path_style = payload.get("pathStyle")
    if isinstance(path_style, str):
        out["path_style"] = path_style

    wire_style = payload.get("style")
    if isinstance(wire_style, dict):
        for camel, snake in _EDGE_STYLE_KEY_MAP_INV.items():
            if camel in wire_style:
                out[snake] = wire_style[camel]

    canonical = _extract_canonical_colors(payload.get("data"))
    for k, v in canonical.items():
        out[k] = v

    return out


def _extract_midpoint(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Read the precomputed midpoint off a wire `Edge` / `Partial<Edge>`.

    The client computes the midpoint world coords from
    `cubicControlToMidpoint(source, target, control)` and attaches it
    here so the server doesn't have to look up node positions to
    rebuild it. Returns the PositionProperty-shaped dict ready to
    drop onto `properties.edge_control_point`, or None if absent.
    """
    m = payload.get("_midpoint")
    if not isinstance(m, dict):
        return None
    x = m.get("x")
    y = m.get("y")
    if x is None or y is None:
        return None
    try:
        return {
            "type": "position",
            "position": {"x": float(x), "y": float(y)},
        }
    except (TypeError, ValueError):
        return None


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
