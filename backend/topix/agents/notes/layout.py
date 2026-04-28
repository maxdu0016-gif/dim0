"""Post-turn layout for notes the agent just created.

The agent writes notes one-by-one via `write_note` and optionally connects them
with `link_notes`. Each individual write lands at the backend's stacked default
position, which is fine for single-note turns but produces a column for multi-
note ones. After the planner's turn ends, :func:`rearrange_created_notes` runs
once over the newly-created ids, groups them by connected component (including
any *old* nodes the agent linked to as fixed anchors), runs an igraph Sugiyama
layout per component, and then either pins the layout to an old anchor or
flex-wraps the remaining components below existing board content.

Old anchors keep their real-world position; only newly-created nodes are moved.
Failure is non-fatal at the manager level, so a layout error degrades to the
backend's stacked-column default rather than breaking the turn.
"""

from __future__ import annotations

from collections import defaultdict

from topix.agents.notes.service import DEFAULT_NOTE_GAP
from topix.datatypes.note.link import Link
from topix.datatypes.note.note import Note
from topix.datatypes.property import PositionProperty
from topix.store.graph import GraphStore
from topix.utils.graph.layout import LayoutDirection, layout_directed

# Defaults tuned to match the frontend dagre feel and the document parsing pipeline.
H_GAP = 75.0
V_GAP = 150.0
TILE_GAP_X = 80.0
TILE_GAP_Y = 120.0
MAX_ROW_WIDTH = 3500.0


def _connected_components(
    note_ids: list[str],
    edges: list[tuple[str, str]],
) -> list[list[str]]:
    """Group ids into connected components via union-find, preserving input order."""
    id_set = set(note_ids)
    parent = {nid: nid for nid in note_ids}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for source, target in edges:
        if source in id_set and target in id_set:
            union(source, target)

    buckets: dict[str, list[str]] = defaultdict(list)
    for nid in note_ids:
        buckets[find(nid)].append(nid)

    ordered_roots: list[str] = []
    for nid in note_ids:
        root = find(nid)
        if root not in ordered_roots:
            ordered_roots.append(root)
    return [buckets[r] for r in ordered_roots]


def _size_of(note: Note) -> tuple[float, float]:
    """Return the note's persisted (width, height), defaulting to (0, 0) if unset."""
    size = note.properties.node_size.size
    if size is None:
        return 0.0, 0.0
    return size.width, size.height


def _real_position(note: Note) -> tuple[float, float]:
    """Return the note's persisted (x, y), defaulting to (0, 0) if unset."""
    pos = note.properties.node_position.position
    if pos is None:
        return 0.0, 0.0
    return pos.x, pos.y


async def _board_tail_origin(
    graph_store: GraphStore,
    graph_uid: str,
    exclude_ids: set[str],
) -> tuple[float, float]:
    """Return an origin just below existing board content, ignoring the given ids.

    `exclude_ids` keeps the newly-created notes (still at their stacked default
    position) from contributing to the board's bottom edge, which would otherwise
    push the new layout down arbitrarily.
    """
    graph = await graph_store.get_graph(graph_uid)
    if graph is None:
        return 0.0, 0.0

    siblings = [
        n for n in graph.nodes
        if n.deleted_at is None
        and n.id not in exclude_ids
        and n.properties.node_position.position is not None
    ]
    if not siblings:
        return 0.0, 0.0

    min_x = min(n.properties.node_position.position.x for n in siblings)
    max_y = max(
        n.properties.node_position.position.y
        + (n.properties.node_size.size.height if n.properties.node_size.size else 0.0)
        for n in siblings
    )
    return min_x, max_y + DEFAULT_NOTE_GAP


def _component_layout(
    component_ids: list[str],
    component_edges: list[tuple[str, str]],
    sizes: dict[str, tuple[float, float]],
    h_gap: float = H_GAP,
    v_gap: float = V_GAP,
) -> tuple[dict[str, tuple[float, float]], float, float]:
    """Run Sugiyama on a connected component and return positions + bbox.

    Returns (positions_by_id, width, height). Positions are normalized so the
    component's top-left corner sits at (0, 0). Cycles and DAGs are handled by
    igraph's feedback-arc-set step.
    """
    if len(component_ids) == 1:
        nid = component_ids[0]
        w, h = sizes[nid]
        return {nid: (0.0, 0.0)}, w, h

    raw = layout_directed(
        nodes=component_ids,
        edges=[[s, t] for s, t in component_edges],
        direction=LayoutDirection.LEFT_RIGHT,
        hgap=h_gap,
        vgap=v_gap,
    )

    min_x = min(x for x, _ in raw.values())
    min_y = min(y for _, y in raw.values())
    max_x = max(raw[nid][0] + sizes[nid][0] for nid in component_ids)
    max_y = max(raw[nid][1] + sizes[nid][1] for nid in component_ids)
    normalized = {nid: (raw[nid][0] - min_x, raw[nid][1] - min_y) for nid in component_ids}
    return normalized, max_x - min_x, max_y - min_y


async def rearrange_created_notes(  # noqa: C901
    graph_store: GraphStore,
    graph_uid: str,
    created_ids: list[str],
    created_link_ids: list[str] | None = None,
    max_row_width: float = MAX_ROW_WIDTH,
    h_gap: float = TILE_GAP_X,
    v_gap: float = TILE_GAP_Y,
) -> list[str]:
    """Lay out newly-created notes per connected component, anchored where possible.

    Behavior per component:
    - 1 movable node, no anchor: contributes one tile to the flex-wrap row.
    - >=2 nodes, no anchor: Sugiyama-laid-out tile in the flex-wrap row.
    - >=1 movable + >=1 anchor (an old node touched via a created link): runs
      Sugiyama including the anchor, then translates the whole component so the
      leftmost anchor lands back at its real-world position. The anchor itself
      is never repositioned.

    Args:
        graph_store: Store used to read notes/links and patch positions.
        graph_uid: Board scope. Notes or links belonging to a different board are ignored.
        created_ids: Ids of notes created in the current turn. Only these are moved.
        created_link_ids: Ids of links created in the current turn. Used to pull old
            anchor nodes into their components. Empty/None means singletons-only.
        max_row_width: Width budget for a row before wrapping to the next.
        h_gap: Horizontal gap between flex-wrap tiles in the same row.
        v_gap: Vertical gap between flex-wrap rows.

    Returns:
        The ids that were actually repositioned.

    """
    if len(created_ids) < 2:
        return []

    seen: set[str] = set()
    ordered_movable: list[str] = []
    for nid in created_ids:
        if nid in seen:
            continue
        seen.add(nid)
        ordered_movable.append(nid)

    fetched_movable = await graph_store.get_nodes(ordered_movable)
    movable_by_id: dict[str, Note] = {
        n.id: n for n in fetched_movable
        if n.graph_uid == graph_uid and n.deleted_at is None
    }
    movable_ids = [nid for nid in ordered_movable if nid in movable_by_id]
    if len(movable_ids) < 2:
        return []
    movable_set = set(movable_ids)

    relevant_links: list[Link] = []
    if created_link_ids:
        seen_link_ids: set[str] = set()
        unique_link_ids = [
            lid for lid in created_link_ids
            if not (lid in seen_link_ids or seen_link_ids.add(lid))
        ]
        fetched_links = await graph_store.get_links(unique_link_ids)
        for link in fetched_links:
            if link.graph_uid != graph_uid or link.deleted_at is not None:
                continue
            if link.source in movable_set or link.target in movable_set:
                relevant_links.append(link)

    anchor_candidate_ids = {
        nid
        for link in relevant_links
        for nid in (link.source, link.target)
        if nid not in movable_set
    }
    anchors_by_id: dict[str, Note] = {}
    if anchor_candidate_ids:
        anchors_fetched = await graph_store.get_nodes(list(anchor_candidate_ids))
        anchors_by_id = {
            n.id: n for n in anchors_fetched
            if n.graph_uid == graph_uid and n.deleted_at is None
        }

    all_ids = movable_ids + [nid for nid in anchor_candidate_ids if nid in anchors_by_id]
    all_set = set(all_ids)
    component_edges = [
        (link.source, link.target)
        for link in relevant_links
        if link.source in all_set and link.target in all_set
    ]

    sizes: dict[str, tuple[float, float]] = {}
    for nid, note in movable_by_id.items():
        sizes[nid] = _size_of(note)
    for nid, note in anchors_by_id.items():
        sizes[nid] = _size_of(note)

    components = _connected_components(all_ids, component_edges)

    final_positions: dict[str, tuple[float, float]] = {}
    free_tiles: list[tuple[dict[str, tuple[float, float]], float, float]] = []

    for comp_ids in components:
        comp_movable = [nid for nid in comp_ids if nid in movable_set]
        comp_anchors = [nid for nid in comp_ids if nid in anchors_by_id]
        if not comp_movable:
            continue

        comp_set = set(comp_ids)
        edges_in_comp = [(s, t) for s, t in component_edges if s in comp_set and t in comp_set]
        positions, width, height = _component_layout(
            component_ids=comp_ids,
            component_edges=edges_in_comp,
            sizes=sizes,
        )

        if comp_anchors:
            ref_anchor = min(
                comp_anchors,
                key=lambda nid: _real_position(anchors_by_id[nid]),
            )
            ax_real, ay_real = _real_position(anchors_by_id[ref_anchor])
            ax_layout, ay_layout = positions[ref_anchor]
            dx = ax_real - ax_layout
            dy = ay_real - ay_layout
            for nid in comp_movable:
                lx, ly = positions[nid]
                final_positions[nid] = (lx + dx, ly + dy)
        else:
            free_tiles.append((positions, width, height))

    if free_tiles:
        origin_x, origin_y = await _board_tail_origin(graph_store, graph_uid, movable_set)
        cursor_x = origin_x
        cursor_y = origin_y
        row_width = 0.0
        row_max_h = 0.0

        for tile_positions, tile_w, tile_h in free_tiles:
            if row_width > 0.0 and row_width + tile_w > max_row_width:
                cursor_y += row_max_h + v_gap
                cursor_x = origin_x
                row_width = 0.0
                row_max_h = 0.0
            for nid, (lx, ly) in tile_positions.items():
                if nid in movable_set:
                    final_positions[nid] = (cursor_x + lx, cursor_y + ly)
            cursor_x += tile_w + h_gap
            row_width += tile_w + h_gap
            if tile_h > row_max_h:
                row_max_h = tile_h

    moved: list[str] = []
    for nid, (x, y) in final_positions.items():
        patch = {
            "properties": {
                "node_position": PositionProperty(
                    position=PositionProperty.Position(x=x, y=y),
                ).model_dump()
            }
        }
        updated = await graph_store.patch_note(nid, patch)
        if updated is not None:
            moved.append(nid)
    return moved
