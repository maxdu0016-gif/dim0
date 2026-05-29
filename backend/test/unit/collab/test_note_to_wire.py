"""Tests for the server-side Note/Link → canvas-harness wire converters.

The wire `type` field on a Node must use canvas-harness's shape
vocabulary, not Dim0's enum values. Four entries are renamed
(`rectangle → rect`, `layered-rectangle → layered-rect`,
`layered-circle → layered-ellipse`, `slide → frame`); the rest are
1:1 with either built-in shapes or client-registered custom defs.
"""

import pytest

from topix.collab.note_to_wire import (
    _CANVAS_TO_DIM0_TYPE,
    _DIM0_TO_CANVAS_TYPE,
    note_to_wire_node,
)
from topix.datatypes.file.document import Document
from topix.datatypes.note.note import Note
from topix.datatypes.note.style import NodeType, Style


def _note_with_style_type(style_type: NodeType) -> Note:
    """Build a minimal Note carrying a specific Dim0 NodeType for wire conversion."""
    return Note(id="n1", graph_uid="b1", style=Style(type=style_type))


# All four shape renames where Dim0 and canvas-harness disagree on the name.
RENAMES = [
    (NodeType.RECTANGLE, "rect"),
    (NodeType.LAYERED_RECTANGLE, "layered-rect"),
    (NodeType.LAYERED_CIRCLE, "layered-ellipse"),
    (NodeType.SLIDE, "frame"),
]


# All 14 types where the Dim0 enum string matches the canvas-harness
# built-in / custom-def string verbatim. Listed explicitly so a future
# rename or custom-def addition surfaces here.
IDENTITY = [
    (NodeType.ELLIPSE, "ellipse"),
    (NodeType.DIAMOND, "diamond"),
    (NodeType.TAG, "tag"),
    (NodeType.CAPSULE, "capsule"),
    (NodeType.THOUGHT_CLOUD, "thought-cloud"),
    (NodeType.LAYERED_DIAMOND, "layered-diamond"),
    (NodeType.SOFT_DIAMOND, "soft-diamond"),
    (NodeType.TEXT, "text"),
    (NodeType.IMAGE, "image"),
    (NodeType.ICON, "icon"),
    (NodeType.FOLDER, "folder"),
    (NodeType.SHEET, "sheet"),
    (NodeType.CODE_SANDBOX, "code-sandbox"),
    (NodeType.WIDGET, "widget"),
]


@pytest.mark.parametrize(("dim0_type", "expected"), RENAMES)
def test_wire_type_applies_renames(dim0_type: NodeType, expected: str) -> None:
    """Dim0 enum values that differ from canvas-harness built-ins get translated.

    Without these renames, peers receive a node.add with a `type` string
    canvas-harness has no renderer for; the node enters the store but
    paints nothing — the "invisible rectangle" symptom that gave us the
    bug report.
    """
    note = _note_with_style_type(dim0_type)
    wire = note_to_wire_node(note)
    assert wire["type"] == expected


@pytest.mark.parametrize(("dim0_type", "expected"), IDENTITY)
def test_wire_type_passes_through_built_ins_and_custom_defs(
    dim0_type: NodeType, expected: str,
) -> None:
    """14 Dim0 enum values where the canvas-harness name matches verbatim."""
    note = _note_with_style_type(dim0_type)
    wire = note_to_wire_node(note)
    assert wire["type"] == expected


def test_map_covers_every_dim0_node_type() -> None:
    """`_DIM0_TO_CANVAS_TYPE` is exhaustive over the Dim0 NodeType enum.

    A missing entry would silently fall through `_canvas_type_for` and
    render as an unregistered custom type on peers — exactly the bug we
    just fixed. This lock prevents that recurring when new shapes land.
    """
    enum_values = {nt.value for nt in NodeType}
    assert set(_DIM0_TO_CANVAS_TYPE.keys()) == enum_values


def test_inverse_map_round_trips() -> None:
    """Every canvas-harness value maps back to its Dim0 enum value.

    Auto-generated from `_DIM0_TO_CANVAS_TYPE`, so the only way this can
    fail is if the forward map has duplicate values (which would collapse
    two Dim0 types onto one canvas type — a bug).
    """
    for dim0, canvas in _DIM0_TO_CANVAS_TYPE.items():
        assert _CANVAS_TO_DIM0_TYPE[canvas] == dim0


def test_document_takes_precedence_over_style_type() -> None:
    """`Note.type == "document"` ships wire `type="document"` regardless of style.type.

    Documents are a different Dim0 subclass (separate from the NodeType
    enum); the canvas-harness side has a `defineNode("document")`
    registration that the wire targets via this short-circuit.
    """
    doc = Document(id="n1", graph_uid="b1", style=Style(type=NodeType.RECTANGLE))
    wire = note_to_wire_node(doc)
    assert wire["type"] == "document"


def test_unknown_style_type_passes_through_unchanged() -> None:
    """A future Dim0 enum value not yet in the map renders as a custom type.

    Falling through (rather than erroring) lets a new shape land without
    a wire-side rebuild — peers won't render it until both sides know
    about it, but nothing crashes.
    """
    # Bypass the NodeType enum since we want to test the unknown-string
    # path; construct the Style with `model_validate` to skip the
    # pydantic enum check.
    note = Note(id="n1", graph_uid="b1")
    note.style.type = "future-shape"  # type: ignore[assignment]
    wire = note_to_wire_node(note)
    assert wire["type"] == "future-shape"
