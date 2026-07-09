"""Unit tests for the managed web-search proxy (`POST /ai/search`).

Monkeypatches the per-engine search functions so the endpoint's dispatch +
result mapping is exercised without hitting a real provider.
"""

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

import topix.api.router.ai as ai_module

from topix.api.router.ai import router
from topix.api.utils.security import get_current_user_uid


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(router)

    async def _uid():
        return "user-1"

    app.dependency_overrides[get_current_user_uid] = _uid
    return TestClient(app)


def _fake_output():
    return SimpleNamespace(
        answer="cats are great",
        search_results=[
            SimpleNamespace(url="https://a.com", title="A", content="body", source_domain="a.com"),
        ],
    )


def test_search_dispatches_to_the_engine_and_maps_results(monkeypatch):
    """A known engine runs and its results map to {answer, results}."""
    calls = {}

    async def _fake(query, max_results=10):
        calls["query"] = query
        calls["max_results"] = max_results
        return _fake_output()

    monkeypatch.setitem(ai_module._SEARCH_FNS, "perplexity", _fake)

    res = _client().post("/ai/search", json={"query": "cats", "engine": "perplexity"})
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["answer"] == "cats are great"
    assert data["results"][0]["url"] == "https://a.com"
    assert data["results"][0]["title"] == "A"
    assert calls == {"query": "cats", "max_results": 10}


def test_search_defaults_to_perplexity(monkeypatch):
    """Omitting the engine uses perplexity."""
    async def _fake(query, max_results=10):
        return _fake_output()

    monkeypatch.setitem(ai_module._SEARCH_FNS, "perplexity", _fake)
    res = _client().post("/ai/search", json={"query": "cats"})
    assert res.status_code == 200


def test_unknown_engine_is_400(monkeypatch):
    """An unsupported engine is rejected before any provider call."""
    res = _client().post("/ai/search", json={"query": "cats", "engine": "bing"})
    assert res.status_code == 400
