"""Tests for per-plan model-tier gating."""

import topix.config.catalog as catalog

from topix.api.utils.rate_limit.policy import (
    BILLING_ENABLED_ENV,
    DAILY_UTC_LIMITS,
    MONTHLY_UTC_LIMITS,
    resolve_allowed_model_tiers,
)


def test_basic_tier_is_in_limit_tables():
    """The basic plan must have explicit minute/day/month limits."""
    assert DAILY_UTC_LIMITS["basic"] < DAILY_UTC_LIMITS["plus"]
    assert MONTHLY_UTC_LIMITS["basic"] < MONTHLY_UTC_LIMITS["plus"]


def test_allowed_tiers_when_billing_enabled(monkeypatch):
    """With billing on, only plus reaches the pro tier."""
    monkeypatch.setenv(BILLING_ENABLED_ENV, "true")
    assert resolve_allowed_model_tiers("free") == {"lite"}
    assert resolve_allowed_model_tiers("basic") == {"lite"}
    assert resolve_allowed_model_tiers("plus") == {"lite", "pro"}


def test_allowed_tiers_unrestricted_when_billing_disabled(monkeypatch):
    """OSS mode (billing off) grants every tier to every plan."""
    monkeypatch.delenv(BILLING_ENABLED_ENV, raising=False)
    assert resolve_allowed_model_tiers("free") == {"lite", "pro"}
    assert resolve_allowed_model_tiers("basic") == {"lite", "pro"}


def test_available_llms_filters_by_tier(monkeypatch):
    """available_llms restricts to the requested tiers when given."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    catalog._resolved_for.cache_clear()

    lite_only = catalog.available_llms({"lite"})
    assert lite_only, "expected at least one lite model with OpenRouter key"
    assert all(m.tier == "lite" for m in lite_only)

    everything = catalog.available_llms()
    assert any(m.tier == "pro" for m in everything)


def test_is_model_allowed_respects_tier(monkeypatch):
    """A pro model is gated for a lite-only plan but allowed otherwise."""
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    catalog._resolved_for.cache_clear()

    pro = next((m for m in catalog.available_llms() if m.tier == "pro"), None)
    lite = next((m for m in catalog.available_llms() if m.tier == "lite"), None)
    assert pro and lite

    assert catalog.is_model_allowed(pro.id, {"lite", "pro"}) is True
    assert catalog.is_model_allowed(pro.id, {"lite"}) is False
    assert catalog.is_model_allowed(lite.id, {"lite"}) is True
    # None means unrestricted (any reachable model is allowed).
    assert catalog.is_model_allowed(pro.id, None) is True
