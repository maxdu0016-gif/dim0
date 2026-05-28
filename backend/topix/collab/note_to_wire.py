"""Note / Link → canvas-harness wire-shape converters.

Inverse of [topix.collab.apply_ops](apply_ops.py) for the subset of fields
the agent path produces. The full faithful conversion (theme adaptation,
image src lifting, document-type override) lives on the client; the
server-side version is intentionally lossy on cosmetic details since
the receiving peer rebuilds the rendered Node from this wire payload
via attachSync's remote-batch path.
"""

import math

from typing import Any

from topix.datatypes.note.link import Link
from topix.datatypes.note.note import Note

DEG_TO_RAD = math.pi / 180.0


def note_to_wire_node(note: Note) -> dict[str, Any]:
    """Build a canvas-harness `Node`-shaped dict from a Dim0 Note.

    Carries enough for `attachSync`'s remote-batch apply to add the
    node to the receiving client's store; remaining cosmetic
    differences (theme-adapted colors) are reconciled on the next
    snapshot load.
    """
    props = note.properties
    pos = props.node_position.position
    size = props.node_size.size

    style_dict: dict[str, Any] = note.style.model_dump(exclude_none=True)
    angle_deg = style_dict.pop("angle", 0) or 0
    style_type = style_dict.pop("type", None)

    data: dict[str, Any] = {
        "noteType": note.type,
        "styleType": style_type or note.style.type,
        "version": note.version,
        "graphUid": note.graph_uid,
        "parentId": note.parent_id,
        "label": note.label.model_dump(exclude_none=True) if note.label else None,
        # All non-lifted properties go on data.properties so the client
        # round-trips them via nodeToNote.
        "properties": _properties_minus_lifted(props),
    }

    return {
        "id": note.id,
        "type": _canvas_type_for(note),
        "x": float(pos.x),
        "y": float(pos.y),
        "w": float(size.width),
        "h": float(size.height),
        "z": float(props.node_z_index.number),
        "angle": float(angle_deg) * DEG_TO_RAD,
        "content": note.content.markdown if note.content else "",
        "style": style_dict,
        "data": {k: v for k, v in data.items() if v is not None},
    }


def link_to_wire_edge(link: Link) -> dict[str, Any]:
    """Build a canvas-harness `Edge`-shaped dict from a Dim0 Link."""
    return {
        "id": link.id,
        "source": {"nodeId": link.source},
        "target": {"nodeId": link.target},
    }


def patch_data_to_wire_patch(data: dict[str, Any]) -> dict[str, Any]:  # noqa: C901 — wide field-by-field translator
    """Translate a Dim0 patch_note `data` dict into a `Partial<Node>` wire patch.

    Inverse of `_node_patch_to_note_data` in apply_ops.py. Only handles
    the scene-graph primitives shipped in Phase 1b — style / data depth
    follow as needed.
    """
    patch: dict[str, Any] = {}
    properties = data.get("properties") or {}

    node_position = properties.get("node_position")
    if node_position and "position" in node_position:
        pos = node_position["position"]
        if "x" in pos:
            patch["x"] = float(pos["x"])
        if "y" in pos:
            patch["y"] = float(pos["y"])

    node_size = properties.get("node_size")
    if node_size and "size" in node_size:
        size = node_size["size"]
        if "width" in size:
            patch["w"] = float(size["width"])
        if "height" in size:
            patch["h"] = float(size["height"])

    node_z = properties.get("node_z_index")
    if node_z and "number" in node_z:
        patch["z"] = float(node_z["number"])

    style = data.get("style")
    if isinstance(style, dict):
        angle = style.get("angle")
        if angle is not None:
            patch["angle"] = float(angle) * DEG_TO_RAD

    if "content" in data and isinstance(data["content"], dict):
        markdown = data["content"].get("markdown")
        if markdown is not None:
            patch["content"] = str(markdown)

    return patch


def _properties_minus_lifted(props) -> dict[str, Any]:
    """Strip the three lifted properties before serializing to wire.

    Removes position/size/z so they don't shadow `node.x/y/w/h/z` in
    the wire payload.
    """
    dumped = props.model_dump(exclude_none=True)
    dumped.pop("node_position", None)
    dumped.pop("node_size", None)
    dumped.pop("node_z_index", None)
    return dumped


def _canvas_type_for(note: Note) -> str:
    """Mirror the client's `dim0TypeToCanvas` mapping.

    Documents get the `'document'` canvas type; everything else uses
    `style.type` as-is.
    """
    if note.type == "document":
        return "document"
    return str(note.style.type) if note.style and note.style.type else "rect"
