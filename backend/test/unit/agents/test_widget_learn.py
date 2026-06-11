"""Tests for widget learning tools."""

from __future__ import annotations

import pytest

from agents import RunContextWrapper

from topix.agents.datatypes.context import Context
from topix.agents.widgets.learn import (
    learn_generate_html_widget,
    learn_generate_mini_app,
)


@pytest.mark.asyncio
async def test_learn_generate_html_widget_returns_widget_note_guidance() -> None:
    """Widget learning tool should return prompt guidance for widget notes."""
    prompt = await learn_generate_html_widget(RunContextWrapper(Context()))

    assert "write_note" in prompt


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
