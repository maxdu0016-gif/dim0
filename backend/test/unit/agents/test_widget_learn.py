"""Tests for widget learning tools."""

from __future__ import annotations

import pytest

from agents import RunContextWrapper

from topix.agents.datatypes.context import Context
from topix.agents.prompt_utils import render_prompt
from topix.agents.widgets.learn import (
    learn_generate_html_widget,
    learn_generate_mini_app,
)


@pytest.mark.asyncio
async def test_learn_generate_html_widget_returns_widget_note_guidance() -> None:
    """HTML widget skill still returns guidance, with a deprecation banner.

    The note type stays renderable forever (existing widget notes), but
    the skill must steer the agent toward mini-app for new authoring.
    """
    prompt = await learn_generate_html_widget(RunContextWrapper(Context()))

    assert "write_note" in prompt
    # Phase A deprecation banner — anchored so it can't silently regress.
    assert "legacy" in prompt.lower()
    assert "learn_generate_mini_app" in prompt


@pytest.mark.asyncio
async def test_learn_generate_mini_app_returns_skill_prompt() -> None:
    """Mini-app learning tool returns prompt guidance for mini-app notes."""
    prompt = await learn_generate_mini_app(RunContextWrapper(Context()))

    # The skill prompt must teach the contract the validator enforces:
    # write_note + the mini-app note type + the host RPC surface + the
    # Widget convention. If any of these drop out we'd ship a misleading
    # prompt the agent can't act on.
    assert "write_note" in prompt
    assert "mini-app" in prompt
    assert "host.saveState" in prompt
    assert "Widget" in prompt
    # Drift guard for the scope manifest: when new identifiers join
    # MINI_APP_SCOPE on the frontend, the prompt must mention them too —
    # otherwise the agent doesn't know they're available and the
    # widgets it ships are limited to a stale subset of the runtime.
    assert "Chart" in prompt
    assert "Graph" in prompt
    # Typography + color guidance — the agent must know about the three
    # font families and the semantic shadcn palette, otherwise widgets
    # come out monochrome and don't theme across light/dark.
    assert "font-handwriting" in prompt
    assert "font-mono" in prompt
    assert "bg-card" in prompt
    assert "text-muted-foreground" in prompt
    assert "oklch" in prompt
    # Phase A demotion: the prompt no longer compares to HTML widget —
    # mini-app is the answer, not "the better of two options". Keeps
    # us from accidentally re-introducing the decision tree.
    assert "HTML widget" not in prompt
    assert "Pick mini-app over" not in prompt


def test_plan_system_prompt_lists_mini_app_before_html_widget() -> None:
    """Plan agent's main prompt should reach for mini-app first.

    The PICK ONE FORMAT decision tree drives which `learn_generate_*`
    skill the agent loads. If HTML widget is mentioned before mini-app,
    the agent's first-pass heuristic pulls the legacy skill and we
    silently regress on the deprecation. Anchor the order explicitly.
    """
    prompt = render_prompt("plan.system.jinja")
    mini_app_idx = prompt.find("learn_generate_mini_app")
    html_widget_idx = prompt.find("learn_generate_html_widget")
    assert mini_app_idx >= 0, "mini-app skill must be referenced in plan.system.jinja"
    assert html_widget_idx >= 0, "html widget skill still referenced as legacy"
    assert mini_app_idx < html_widget_idx, (
        "mini-app must be listed before HTML widget in plan.system.jinja "
        "so the agent's first-pass heuristic picks the modern skill"
    )
    # Demotion marker — same idea as above but anchored to the literal.
    assert "legacy" in prompt.lower()
