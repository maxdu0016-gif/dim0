"""Model Enum."""
from enum import Enum


class OpenAIModel(str, Enum):
    """OpenAI Models."""

    GPT_4O = "openai/gpt-4o"
    GPT_4O_MINI = "openai/gpt-4o-mini"
    GPT_4_1 = "openai/gpt-4.1"
    GPT_4_1_MINI = "openai/gpt-4.1-mini"
    GPT_4_1_NANO = "openai/gpt-4.1-nano"
    GPT_5 = "openai/gpt-5"
    GPT_5_MINI = "openai/gpt-5-mini"
    GPT_5_NANO = "openai/gpt-5-nano"
    GPT_5_4 = "openai/gpt-5.4"
    GPT_5_4_MINI = "openai/gpt-5.4-mini"
    GPT_5_4_NANO = "openai/gpt-5.4-nano"
    GPT_5_1_CHAT = "openai/gpt-5.1-chat-latest"
    GPT_5_1 = "openai/gpt-5.1"
    GPT_5_2 = "openai/gpt-5.2"
    GPT_5_2_CHAT = "openai/gpt-5.2-chat-latest"


class GeminiModel(str, Enum):
    """Gemini Models."""

    GEMINI_2_FLASH = "gemini/gemini-2.0-flash"
    GEMINI_2_5_FLASH = "gemini/gemini-2.5-flash"
    GEMINI_2_5_PRO = "gemini/gemini-2.5-pro"


class OpenRouterModel(str, Enum):
    """Anthropic Models."""

    CLAUDE_OPUS_4_6 = "openrouter/anthropic/claude-opus-4.6"
    CLAUDE_OPUS_4_5 = "openrouter/anthropic/claude-opus-4.5"
    CLAUDE_SONNET_4_6 = "openrouter/anthropic/claude-sonnet-4.6"
    CLAUDE_OPUS_4_1 = "openrouter/anthropic/claude-opus-4.1"
    CLAUDE_HAIKU = "openrouter/anthropic/claude-3.5-haiku"
    DEEPSEEK_CHAT = "openrouter/deepseek/deepseek-chat-v3.1"
    MISTRAL_MEDIUM = "openrouter/mistralai/mistral-medium-3.1"
    GEMINI_2_5_FLASH = "openrouter/google/gemini-2.5-flash"
    GLM_4_7 = "openrouter/z-ai/glm-4.7:nitro"
    QWEN_3_5_PLUS = "openrouter/qwen/qwen3.5-plus-02-15"
    QWEN_3_6_PLUS = "openrouter/qwen/qwen3.6-plus-preview:free"


class PerplexityModel(str, Enum):
    """Perplexity Models."""

    PERPLEXITY_SONAR = "perplexity/sonar"


class ModelEnum:
    """Model Enum."""

    OpenAI = OpenAIModel
    Gemini = GeminiModel
    Perplexity = PerplexityModel
    OpenRouter = OpenRouterModel


def _bare(model: object) -> str:
    """Return a model's bare name (final path segment), ignoring any route prefix.

    Capability checks must hold whether a model is addressed natively
    ("openai/gpt-5.4"), routed through OpenRouter ("openrouter/openai/gpt-5.4"),
    or wrapped in a LitellmModel — all share the same bare name "gpt-5.4".
    """
    name = model.model if hasattr(model, "model") else model
    if isinstance(name, Enum):
        name = name.value  # str(Enum) yields "OpenAIModel.X", not the model string
    return str(name).rsplit("/", 1)[-1]


# Capability sets keyed on bare model names so they match regardless of route.
_NO_TEMPERATURE_MODELS = frozenset(_bare(m) for m in (
    OpenAIModel.GPT_5,
    OpenAIModel.GPT_5_MINI,
    OpenAIModel.GPT_5_NANO,
    OpenAIModel.GPT_5_4,
    OpenAIModel.GPT_5_4_MINI,
    OpenAIModel.GPT_5_4_NANO,
    OpenAIModel.GPT_5_1_CHAT,
))

_REASONING_MODELS = frozenset(_bare(m) for m in (
    # OpenAI reasoning-capable
    OpenAIModel.GPT_5_1,
    OpenAIModel.GPT_5_1_CHAT,
    OpenAIModel.GPT_5,
    OpenAIModel.GPT_5_MINI,
    OpenAIModel.GPT_5_NANO,
    OpenAIModel.GPT_5_2,
    OpenAIModel.GPT_5_2_CHAT,
    OpenAIModel.GPT_5_4,
    OpenAIModel.GPT_5_4_MINI,
    OpenAIModel.GPT_5_4_NANO,
    # Gemini reasoning-capable
    GeminiModel.GEMINI_2_5_FLASH,
    GeminiModel.GEMINI_2_5_PRO,
    # Perplexity reasoning-capable
    PerplexityModel.PERPLEXITY_SONAR,
))

_REASONING_EFFORT_INSTANT_MODELS = frozenset(_bare(m) for m in (
    OpenAIModel.GPT_5_1_CHAT,
))

_REASONING_EFFORT_NONE_MODELS = frozenset(_bare(m) for m in (
    OpenAIModel.GPT_5_1,
    OpenAIModel.GPT_5_4,
    OpenAIModel.GPT_5_4_MINI,
    OpenAIModel.GPT_5_4_NANO,
    OpenAIModel.GPT_5_2,
    OpenAIModel.GPT_5_2_CHAT,
))

_NO_PENALTIES_MODELS = frozenset(_bare(m) for m in (
    OpenAIModel.GPT_4O,
    OpenAIModel.GPT_4O_MINI,
    OpenAIModel.GPT_4_1,
    OpenAIModel.GPT_4_1_MINI,
    OpenAIModel.GPT_4_1_NANO,
    OpenAIModel.GPT_5_1_CHAT,
    OpenAIModel.GPT_5,
    OpenAIModel.GPT_5_MINI,
    OpenAIModel.GPT_5_NANO,
    OpenAIModel.GPT_5_4,
    OpenAIModel.GPT_5_4_MINI,
    OpenAIModel.GPT_5_4_NANO,
    GeminiModel.GEMINI_2_5_FLASH,
    GeminiModel.GEMINI_2_5_PRO,
))


def support_temperature(model: object) -> bool:
    """Check if the model supports temperature.

    Temperature is possibly not supported in reasoning models due to
    introduced newer parameters like `verbosity` or `reasoning_effort`.
    """
    return _bare(model) not in _NO_TEMPERATURE_MODELS


def support_reasoning(model: object) -> bool:
    """Check if the model supports reasoning."""
    return _bare(model) in _REASONING_MODELS


def support_reasoning_effort_instant_mode(model: object) -> bool:
    """Check if the model supports instant reasoning effort."""
    return _bare(model) in _REASONING_EFFORT_INSTANT_MODELS


def support_reasoning_effort_none(model: object) -> bool:
    """Check if the model supports 'none' reasoning effort."""
    return _bare(model) in _REASONING_EFFORT_NONE_MODELS


def support_penalties(model: object) -> bool:
    """Check if the model supports frequency and presence penalty."""
    return _bare(model) not in _NO_PENALTIES_MODELS
