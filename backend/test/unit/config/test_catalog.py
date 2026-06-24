"""Unit tests for the model catalog resolver (config/catalog.py).

The catalog reads provider keys live from the environment, so each test clears
all provider keys and sets only the ones under test via monkeypatch.
"""

import pytest

from topix.config import catalog

PROVIDER_KEYS = [
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "MISTRAL_API_KEY",
    "DEEPSEEK_API_KEY",
    "LINKUP_API_KEY",
    "TAVILY_API_KEY",
    "PERPLEXITY_API_KEY",
    "EXA_API_KEY",
]


@pytest.fixture
def clean_keys(monkeypatch):
    """Remove all provider keys so each test starts from a known-empty state."""
    for key in PROVIDER_KEYS:
        monkeypatch.delenv(key, raising=False)
    return monkeypatch


def test_no_keys_yields_nothing(clean_keys):
    """With no keys set, nothing resolves and helpers return empty/None."""
    assert catalog.available_providers() == []
    assert catalog.available_llms() == []
    assert catalog.available_embedding() is None
    assert catalog.default_model_code() is None
    assert catalog.resolve_code("gpt-4.1") is None


def test_openai_only_routes_native(clean_keys):
    """With only OpenAI, every model routes natively and OR-only models vanish."""
    clean_keys.setenv("OPENAI_API_KEY", "sk-x")

    providers = catalog.available_providers()
    assert providers == ["openai"]

    llms = catalog.available_llms()
    # Every reachable model routes through the native OpenAI provider.
    assert llms, "expected OpenAI models to be available"
    assert all(m.provider == "openai" and m.call.startswith("openai/") for m in llms)

    # OpenRouter-only models (z-ai/qwen/moonshot) are not reachable.
    ids = {m.id for m in llms}
    assert "glm-4.7" not in ids
    assert "gpt-4.1" in ids

    assert catalog.resolve_code("gpt-4.1") == "openai/gpt-4.1"
    # A model with no native OpenAI route is unreachable here.
    assert catalog.resolve_code("claude-opus-4.6") is None

    emb = catalog.available_embedding()
    assert emb is not None
    assert emb.provider == "openai"
    assert emb.model == "text-embedding-3-small"
    assert emb.dim == 512


def test_openrouter_only_routes_via_openrouter(clean_keys):
    """With only OpenRouter, all models (incl. embeddings) route through it."""
    clean_keys.setenv("OPENROUTER_API_KEY", "or-x")

    assert catalog.available_providers() == ["openrouter"]

    llms = catalog.available_llms()
    assert all(m.provider == "openrouter" and m.call.startswith("openrouter/") for m in llms)

    # OpenAI models are reachable through OpenRouter.
    assert catalog.resolve_code("gpt-4.1") == "openrouter/openai/gpt-4.1"
    # So is Claude, with no native Anthropic key.
    assert catalog.resolve_code("claude-opus-4.6") == "openrouter/anthropic/claude-opus-4.6"

    # Embeddings work through OpenRouter (no OpenAI key required).
    emb = catalog.available_embedding()
    assert emb is not None
    assert emb.provider == "openrouter"
    assert emb.model == "openai/text-embedding-3-small"
    assert emb.dim == 512


def test_native_route_preferred_over_openrouter(clean_keys):
    """Native routes win over OpenRouter when both keys are present."""
    clean_keys.setenv("OPENAI_API_KEY", "sk-x")
    clean_keys.setenv("OPENROUTER_API_KEY", "or-x")
    clean_keys.setenv("ANTHROPIC_API_KEY", "an-x")

    # Native routes win when both a native key and OpenRouter are present.
    assert catalog.resolve_code("gpt-4.1") == "openai/gpt-4.1"
    assert catalog.resolve_code("claude-opus-4.6") == "anthropic/claude-opus-4-6"
    # A model with no native key still falls back to OpenRouter.
    assert catalog.resolve_code("kimi-k2.5") == "openrouter/moonshotai/kimi-k2.5:nitro"


def test_default_model_code_by_tier(clean_keys):
    """default_model_code/default_resolved honor the requested tier."""
    clean_keys.setenv("OPENAI_API_KEY", "sk-x")

    fast = catalog.default_model_code("lite")
    smart = catalog.default_model_code("pro")
    assert fast is not None and smart is not None

    fast_resolved = catalog.default_resolved("lite")
    smart_resolved = catalog.default_resolved("pro")
    assert fast_resolved.tier == "lite"
    assert smart_resolved.tier == "pro"


@pytest.mark.parametrize(
    "given",
    [
        "gpt-4.1-mini",                       # canonical id
        "openai/gpt-4.1-mini",               # legacy provider-prefixed code
        "openrouter/openai/gpt-4.1-mini",    # already-resolved call code
    ],
)
def test_normalize_code_accepts_ids_codes_and_legacy(clean_keys, given):
    """normalize_code maps ids, call codes, and legacy codes to a reachable call."""
    clean_keys.setenv("OPENROUTER_API_KEY", "or-x")
    assert catalog.normalize_code(given) == "openrouter/openai/gpt-4.1-mini"


def test_normalize_code_unknown_returns_none(clean_keys):
    """An unknown model reference normalizes to None."""
    clean_keys.setenv("OPENAI_API_KEY", "sk-x")
    assert catalog.normalize_code("totally-made-up-model") is None


def test_normalize_code_handles_non_str(clean_keys):
    """Non-string input resolves to None instead of raising."""
    clean_keys.setenv("OPENAI_API_KEY", "sk-x")
    assert catalog.normalize_code(None) is None
    assert catalog.resolve_code(None) is None


def test_require_model_code_raises_without_keys(clean_keys):
    """require_model_code raises a clear error when nothing resolves."""
    with pytest.raises(ValueError):
        catalog.require_model_code()

    clean_keys.setenv("OPENAI_API_KEY", "sk-x")
    assert catalog.require_model_code("lite") is not None


def test_openai_compatible_client_only_for_openai_apis(clean_keys):
    """A client is built for openai/openrouter routes, not native others."""
    clean_keys.setenv("OPENROUTER_API_KEY", "or-x")
    emb = catalog.available_embedding()
    assert emb is not None and emb.provider == "openrouter"
    client = catalog.openai_compatible_client(emb)
    assert client is not None
    assert str(client.base_url).rstrip("/").endswith("openrouter.ai/api/v1")
