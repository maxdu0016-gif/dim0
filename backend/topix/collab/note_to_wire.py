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


# Mapping of Dim0 LinkStyle (snake_case) → canvas-harness EdgeStyle
# (camelCase). Pairs match the client's `dim0LinkStyleToCanvas`.
_EDGE_STYLE_KEY_MAP: dict[str, str] = {
    "stroke_color": "strokeColor",
    "stroke_width": "strokeWidth",
    "stroke_style": "strokeStyle",
    "background_color": "backgroundColor",
    "roughness": "roughness",
    "roundness": "roundness",
    "opacity": "opacity",
    "font_family": "fontFamily",
    "font_size": "fontSize",
    "text_align": "textAlign",
    "text_color": "textColor",
    "text_style": "textStyle",
    "source_arrowhead": "sourceArrowhead",
    "target_arrowhead": "targetArrowhead",
}


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


def link_to_wire_edge(
    link: Link,
    *,
    node_sizes: dict[str, tuple[float, float]] | None = None,
) -> dict[str, Any]:
    """Build a canvas-harness `Edge`-shaped dict from a Dim0 Link.

    Ships the full Edge contract so the receiver renders the agent's /
    peer's intent without waiting for a snapshot reload. Mirrors the
    client's `linkToEdge` in `webui/.../convert/link-to-edge.ts`.

    `pathStyle` is non-optional in canvas-harness's `Edge` type — the
    geometry cache (`samplesFor`) returns `undefined` without it and
    `edgeAABBFromSamples` then crashes on `.length`. We fall back to
    `"bezier"` matching Dim0's `LinkStyle.path_style` default.

    `localOffset` on attached endpoints also must exist — defaults to
    node center `(w/2, h/2)` when `node_sizes` provides the size, or
    `(0, 0)` as a last-resort fallback.

    The control midpoint is shipped as `_midpoint` (world coords); the
    receiver runs `midpointToCubicControls` to get the curve. Keeps the
    server stateless on geometry.
    """
    style_dict: dict[str, Any] = (
        link.style.model_dump(exclude_none=True) if link.style else {}
    )
    path_style = style_dict.pop("path_style", "bezier") or "bezier"
    group_ids = style_dict.pop("group_ids", []) or []
    # Lifted onto Edge.angle in canvas-harness (edges don't have rotation
    # in our model — drop it).
    style_dict.pop("angle", None)
    # Discriminator — canvas-harness EdgeStyle has no `type`.
    style_dict.pop("type", None)
    # Dim0 carries fill_style for solid-only edges; canvas-harness drops
    # it (see migration-canvas-harness §3.3).
    style_dict.pop("fill_style", None)

    wire_style: dict[str, Any] = {}
    for snake, camel in _EDGE_STYLE_KEY_MAP.items():
        if snake in style_dict:
            wire_style[camel] = style_dict[snake]

    edge: dict[str, Any] = {
        "id": link.id,
        "source": _attached_end(link.source, node_sizes),
        "target": _attached_end(link.target, node_sizes),
        "pathStyle": path_style,
        "z": 0,
        "groups": list(group_ids),
    }
    if wire_style:
        edge["style"] = wire_style
    if link.label and link.label.markdown:
        edge["content"] = link.label.markdown

    midpoint = _link_midpoint(link)
    if midpoint is not None:
        # Sent under `_midpoint` (not `control`) so the receiver can
        # build cubic controls with its own endpoint world coords.
        edge["_midpoint"] = midpoint

    stored = _link_stored_colors(link)
    if stored:
        edge["data"] = {"_storedColors": stored}

    return edge


def _attached_end(
    node_id: str,
    node_sizes: dict[str, tuple[float, float]] | None,
) -> dict[str, Any]:
    """Build the canvas-harness EdgeEnd `{nodeId, localOffset}` dict."""
    if node_sizes is not None:
        size = node_sizes.get(node_id)
        if size is not None:
            w, h = size
            return {
                "nodeId": node_id,
                "localOffset": {"x": w / 2.0, "y": h / 2.0},
            }
    return {"nodeId": node_id, "localOffset": {"x": 0.0, "y": 0.0}}


def _link_midpoint(link: Link) -> dict[str, float] | None:
    """Pull the world-coord midpoint off Link.properties.edge_control_point."""
    cp = getattr(link.properties, "edge_control_point", None)
    if cp is None:
        return None
    pos = getattr(cp, "position", None)
    if pos is None:
        return None
    try:
        return {"x": float(pos.x), "y": float(pos.y)}
    except (AttributeError, TypeError, ValueError):
        return None


def _link_stored_colors(link: Link) -> dict[str, str] | None:
    """Build the `_storedColors` payload from canonical LinkStyle colors.

    Mirrors the client's `pickStoredEdgeColors` — `backgroundColor`,
    `strokeColor`, `textColor` in camelCase. The server has no concept
    of "stored vs adapted"; we treat Dim0's raw style colors as the
    canonical light-theme values (which is what the client also sends
    via `_storedColors`).
    """
    style = link.style
    if style is None:
        return None
    out: dict[str, str] = {}
    if style.stroke_color:
        out["strokeColor"] = style.stroke_color
    if style.background_color:
        out["backgroundColor"] = style.background_color
    if style.text_color:
        out["textColor"] = style.text_color
    return out or None


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
