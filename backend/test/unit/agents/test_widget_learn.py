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
