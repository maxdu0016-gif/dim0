"""Unit tests for the `meter_run` dependency — one whole agent run = one unit.

A fake Redis provides the SET-NX dedup; `enforce_rate_limit` is monkeypatched to
record calls (or raise 429), so we assert *when* a run is charged.
"""

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.testclient import TestClient

import topix.api.router.ai as ai_module

from topix.api.router.ai import meter_run
from topix.api.utils.security import get_current_user_uid


class _FakeRedis:
    """Minimal SET-NX-EX: first call for a key wins, repeats return False."""

    def __init__(self) -> None:
        self.seen: set[str] = set()

    async def set_if_absent(self, key: str, ttl_seconds: int) -> bool:
        if key in self.seen:
            return False
        self.seen.add(key)
        return True


def _app(monkeypatch, enforce) -> TestClient:
    """App exposing a probe route guarded by meter_run, with enforce stubbed."""
    app = FastAPI()
    app.redis_store = _FakeRedis()
    monkeypatch.setattr(ai_module, "enforce_rate_limit", enforce)

    async def _uid():
        return "u1"

    app.dependency_overrides[get_current_user_uid] = _uid

    @app.post("/_probe")
    async def _probe(_: None = Depends(meter_run)):
        return {"ok": True}

    return TestClient(app)


def _recorder():
    calls: list[str] = []

    async def enforce(_request, user_uid):
        calls.append(user_uid)

    return calls, enforce


def test_first_call_of_a_run_is_metered(monkeypatch):
    """The first managed call of a run charges the quota."""
    calls, enforce = _recorder()
    res = _app(monkeypatch, enforce).post("/_probe", headers={"X-Run-Id": "run-1"})
    assert res.status_code == 200
    assert calls == ["u1"]


def test_subsequent_calls_in_the_same_run_are_free(monkeypatch):
    """Later calls sharing the run id are not charged again."""
    calls, enforce = _recorder()
    client = _app(monkeypatch, enforce)
    for _ in range(3):
        client.post("/_probe", headers={"X-Run-Id": "run-1"})
    assert calls == ["u1"]  # charged exactly once


def test_distinct_runs_are_each_metered(monkeypatch):
    """Different run ids each charge once."""
    calls, enforce = _recorder()
    client = _app(monkeypatch, enforce)
    client.post("/_probe", headers={"X-Run-Id": "a"})
    client.post("/_probe", headers={"X-Run-Id": "b"})
    assert len(calls) == 2


def test_no_run_id_meters_every_call(monkeypatch):
    """A call with no run id is charged on its own (no free-riding)."""
    calls, enforce = _recorder()
    client = _app(monkeypatch, enforce)
    client.post("/_probe")
    client.post("/_probe")
    assert calls == ["u1", "u1"]


def test_over_quota_first_call_returns_429(monkeypatch):
    """When the quota is exhausted, the run's first call is rejected."""
    async def enforce(_request, _uid):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "slow down")

    res = _app(monkeypatch, enforce).post("/_probe", headers={"X-Run-Id": "run-x"})
    assert res.status_code == 429
