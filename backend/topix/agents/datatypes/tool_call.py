"""Reasoning-related data types."""

from enum import StrEnum
from html import escape
from typing import Any, Literal

from pydantic import BaseModel

from topix.agents.datatypes.outputs import ToolOutput
from topix.agents.datatypes.tools import AgentToolName

MAX_COMPACT_TEXT_LENGTH = 10_000


class ToolCallState(StrEnum):
    """Enum for reasoning step states."""

    STARTED = "started"
    COMPLETED = "completed"
    FAILED = "failed"


class ToolCall(BaseModel):
    """A single step in the reasoning process."""

    type: Literal["tool_call"] = "tool_call"
    id: str
    name: AgentToolName
    thought: str = ""
    output: ToolOutput
    event_messages: list[str] = []
    state: ToolCallState = ToolCallState.STARTED
    arguments: dict[str, Any] = {}

    def to_compact_step_description(self) -> str:
        """Convert to a compact string representation for display."""
        input_repr = self._compact_input_repr()
        output_repr = self._compact_output_repr()
        parts = [f'<ToolCall name="{self.name}">']
        if input_repr:
            parts.append(f"<Input>{escape(input_repr)}</Input>")
        if output_repr:
            parts.append(f"<Output>{escape(output_repr)}</Output>")
        parts.append("</ToolCall>")
        return "\n".join(parts)

    def _compact_input_repr(self) -> str:
        """Return a short input summary for the tool call history block."""
        args_str = ", ".join(f'{k}="{v}"' for k, v in self.arguments.items())
        if len(args_str) > MAX_COMPACT_TEXT_LENGTH:
            return args_str[:MAX_COMPACT_TEXT_LENGTH] + "..."
        return args_str

    def _compact_output_repr(self) -> str:
        """Return a short output summary suitable for chat history compaction."""
        if isinstance(self.output, str):
            compact = self.output.strip().replace("\n", " ")
            return compact[:MAX_COMPACT_TEXT_LENGTH] + ("..." if len(compact) > MAX_COMPACT_TEXT_LENGTH else "")

        if hasattr(self.output, "to_compact_repr"):
            return self.output.to_compact_repr()

        return ""
