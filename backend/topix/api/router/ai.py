"""AI provider proxy — managed-keys LLM turn for the client agent (G2).

The client agent orchestrates locally; this endpoint forwards ONE model turn to
the provider with OUR keys, resolved through the shared catalog (multi-provider,
per-plan tier gating, and `"auto"` routing). It is deliberately NOT the full
agent — just a metered egress for a single completion (streaming or not).
Per-run metering lands in a later slice.

Wire shape is OpenAI-compatible on purpose: the client already maps our messages
to OpenAI form (`toOpenAiMessages`/`toOpenAiTools`) and back (`fromOpenAiMessage`),
so a managed turn reuses the exact BYOK mapping — only the transport differs.
"""

import json

from typing import Annotated, Any, Literal

import litellm

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from topix.agents.assistant.auto_model import classify_auto_model_complexity
from topix.agents.assistant.code import execute_code
from topix.agents.websearch.tools import (
    search_exa,
    search_linkup,
    search_perplexity,
    search_tavily,
)
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


def _accumulate_tool_call(slots: dict[int, dict[str, Any]], tc: Any) -> None:
    """Fold one streamed tool-call fragment (by index) into the assembling slots."""
    slot = slots.setdefault(getattr(tc, "index", 0), {"id": None, "name": None, "arguments": ""})
    if getattr(tc, "id", None):
        slot["id"] = tc.id
    fn = getattr(tc, "function", None)
    if fn and getattr(fn, "name", None):
        slot["name"] = fn.name
    if fn and getattr(fn, "arguments", None):
        slot["arguments"] += fn.arguments


@router.post("/llm/stream/", include_in_schema=False)
@router.post("/llm/stream")
async def ai_llm_stream(
    request: Request,
    body: AiLlmRequest,
    user_id: Annotated[str, Depends(get_current_user_uid)],
):
    """Stream one model turn as NDJSON delta lines + a final message.

    `{type:"delta",text}` per token, then `{type:"final",message}`. Tier/model
    resolution (and any 403/503) runs before streaming, so errors are plain HTTP.
    """
    entitlement = await resolve_entitlement_context(request, user_id)
    allowed_tiers = resolve_allowed_model_tiers(entitlement.plan)
    model_code = await _resolve_managed_model(body.model, body.messages, allowed_tiers)

    kwargs: dict[str, Any] = {
        "model": model_code,
        "messages": body.messages,
        "drop_params": True,
        "stream": True,
    }
    if body.tools:
        kwargs["tools"] = body.tools
        kwargs["tool_choice"] = "auto"
    if body.reasoning_effort:
        kwargs["reasoning_effort"] = body.reasoning_effort

    async def generate():
        content = ""
        slots: dict[int, dict[str, Any]] = {}
        stream = await litellm.acompletion(**kwargs)
        async for chunk in stream:
            choices = getattr(chunk, "choices", None) or []
            delta = choices[0].delta if choices else None
            if delta is None:
                continue
            piece = getattr(delta, "content", None)
            if piece:
                content += piece
                yield json.dumps({"type": "delta", "text": piece}) + "\n"
            for tc in getattr(delta, "tool_calls", None) or []:
                _accumulate_tool_call(slots, tc)

        message: dict[str, Any] = {"role": "assistant", "content": content or None}
        if slots:
            message["tool_calls"] = [
                {"id": s["id"], "type": "function",
                 "function": {"name": s["name"], "arguments": s["arguments"]}}
                for s in slots.values()
            ]
        yield json.dumps({"type": "final", "message": message}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


_SEARCH_FNS = {
    "perplexity": search_perplexity,
    "tavily": search_tavily,
    "linkup": search_linkup,
    "exa": search_exa,
}


class AiSearchRequest(BaseModel):
    """A managed web search: a query + which engine (our keys)."""

    query: str
    engine: str = "perplexity"
    max_results: int = 10


@router.post("/search/", include_in_schema=False)
@router.post("/search")
@with_standard_response
async def ai_search(
    response: Response,
    request: Request,
    body: AiSearchRequest,
    user_id: Annotated[str, Depends(get_current_user_uid)],
):
    """Run one web search with our provider keys; returns `{answer, results}`."""
    fn = _SEARCH_FNS.get(body.engine)
    if fn is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Unsupported search engine '{body.engine}'"
        )
    output = await fn(body.query, max_results=body.max_results)
    return {
        "answer": output.answer,
        "results": [
            {
                "url": r.url,
                "title": r.title,
                "content": r.content,
                "source_domain": r.source_domain,
            }
            for r in output.search_results
        ],
    }


class AiCodeRequest(BaseModel):
    """A managed code-interpreter run: source + language (executed on our Daytona)."""

    code: str
    language: str = "python"


@router.post("/code/", include_in_schema=False)
@router.post("/code")
@with_standard_response
async def ai_code(
    response: Response,
    request: Request,
    body: AiCodeRequest,
    user_id: Annotated[str, Depends(get_current_user_uid)],
):
    """Run code in an isolated sandbox with our Daytona account; returns the result.

    `execute_code` self-handles an unrunnable language + unconfigured Daytona
    (returns an error result rather than raising), so this stays a thin proxy.
    """
    output = await execute_code(body.code, body.language)
    return {
        "status": output.status,
        "stdout": output.stdout,
        "stderr": output.stderr,
        "duration_ms": output.duration_ms,
    }
