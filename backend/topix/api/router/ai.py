"""AI provider proxy — managed-keys LLM turn for the client agent (G2).

The client agent orchestrates locally; this endpoint forwards ONE model turn to
the provider with OUR keys, resolved through the shared catalog (multi-provider,
per-plan tier gating, and `"auto"` routing). It is deliberately NOT the full
agent — just a metered egress for a single completion. Per-run metering and
streaming land in later slices.

Wire shape is OpenAI-compatible on purpose: the client already maps our messages
to OpenAI form (`toOpenAiMessages`/`toOpenAiTools`) and back (`fromOpenAiMessage`),
so a managed turn reuses the exact BYOK mapping — only the transport differs.
"""

from typing import Annotated, Any, Literal

import litellm

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel

from topix.agents.assistant.auto_model import classify_auto_model_complexity
from topix.api.utils.decorators import with_standard_response
from topix.api.utils.rate_limit.entitlements import resolve_entitlement_context
from topix.api.utils.rate_limit.policy import resolve_allowed_model_tiers
from topix.api.utils.security import get_current_user_uid
from topix.config import catalog

router = APIRouter(prefix="/ai", tags=["ai"])


class AiLlmRequest(BaseModel):
    """One model turn (OpenAI-shaped `messages`/`tools`; `model` is a catalog id or "auto")."""

    model: str = "auto"
    messages: list[dict[str, Any]] = []
    tools: list[dict[str, Any]] = []
    reasoning_effort: Literal["low", "medium", "high"] | None = None


async def _resolve_managed_model(
    model: str, messages: list[dict[str, Any]], allowed_tiers: set[str]
) -> str:
    """Resolve `model` to a concrete provider call code the plan may use.

    `"auto"` runs the shared complexity classifier and clamps to the plan's
    tiers; an explicit out-of-tier model is 403; an unconfigured model is 503.
    """
    if model == "auto":
        classifier_input = [
            {"role": str(m.get("role", "")), "content": str(m.get("content") or "")}
            for m in messages
        ]
        complexity = await classify_auto_model_complexity(classifier_input)
        pro_ok = "pro" in allowed_tiers
        tier = "pro" if (complexity == "complex" and pro_ok) else "lite"
        resolved = catalog.default_resolved(tier) or catalog.default_resolved()
        if resolved is None:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "No model available")
        return resolved.call

    if not catalog.is_model_allowed(model, allowed_tiers):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, f"Model '{model}' is not available on your plan"
        )
    code = catalog.resolve_code(model)
    if code is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, f"Model '{model}' is not configured"
        )
    return code


def _message_to_dict(message: Any) -> dict[str, Any]:
    """LiteLLM assistant message → the minimal ChatCompletion message (content + tool_calls)."""
    tool_calls: list[dict[str, Any]] = []
    for tc in getattr(message, "tool_calls", None) or []:
        fn = getattr(tc, "function", None)
        tool_calls.append({
            "id": getattr(tc, "id", None),
            "type": "function",
            "function": {
                "name": getattr(fn, "name", None),
                "arguments": getattr(fn, "arguments", "") or "",
            },
        })
    out: dict[str, Any] = {"role": "assistant", "content": getattr(message, "content", None)}
    if tool_calls:
        out["tool_calls"] = tool_calls
    return out


@router.post("/llm/", include_in_schema=False)
@router.post("/llm")
@with_standard_response
async def ai_llm(
    response: Response,
    request: Request,
    body: AiLlmRequest,
    user_id: Annotated[str, Depends(get_current_user_uid)],
):
    """Forward one model turn with our keys. Returns `{choices:[{message}]}`."""
    entitlement = await resolve_entitlement_context(request, user_id)
    allowed_tiers = resolve_allowed_model_tiers(entitlement.plan)
    model_code = await _resolve_managed_model(body.model, body.messages, allowed_tiers)

    kwargs: dict[str, Any] = {"model": model_code, "messages": body.messages, "drop_params": True}
    if body.tools:
        kwargs["tools"] = body.tools
        kwargs["tool_choice"] = "auto"
    if body.reasoning_effort:
        kwargs["reasoning_effort"] = body.reasoning_effort

    result = await litellm.acompletion(**kwargs)
    return {"choices": [{"message": _message_to_dict(result.choices[0].message)}]}
