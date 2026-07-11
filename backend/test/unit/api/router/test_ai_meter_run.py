"""Unit tests for the `meter_run` dependency — one whole agent run = one unit.

A fake Redis provides the SET-NX dedup + the per-IP BYOK window; enforce_rate_limit
is monkeypatched to record calls (or raise 429), so we assert *when* a run is
charged, that BYOK calls skip our quota, and that a managed call needs auth.
"""

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.testclient import TestClient

import topix.api.router.ai as ai_module

from topix.api.router.ai import meter_run, optional_user_uid


class _FakeRedis:
    """SET-NX-EX dedup + a fixed-window counter for the BYOK per-IP guard."""

    def __init__(self, ip_over: bool = False) -> None:
        self.seen: set[str] = set()
        self.ip_over = ip_over

    async def set_if_absent(self, key: str, ttl_seconds: int) -> bool:
        if key in self.seen:
            return False
        self.seen.add(key)
        return True

    async def check_fixed_window_quota(self, key, limit, period, scope="tier_usage"):
        return (not self.ip_over, 60)


def _app(monkeypatch, enforce, uid: str | None = "u1", redis: _FakeRedis | None = None) -> TestClient:
    """App exposing a probe route guarded by meter_run, with enforce + auth stubbed."""
    app = FastAPI()
    app.redis_store = redis or _FakeRedis()
    monkeypatch.setattr(ai_module, "enforce_rate_limit", enforce)

    async def _uid():
        return uid

    app.dependency_overrides[optional_user_uid] = _uid

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


def test_byok_call_is_not_metered(monkeypatch):
    """A call carrying X-Provider-Key (BYOK) is on the user's key — never charged."""
    calls, enforce = _recorder()
    client = _app(monkeypatch, enforce)
    res = client.post("/_probe", headers={"X-Run-Id": "run-1", "X-Provider-Key": "sk-user"})
    assert res.status_code == 200
    assert calls == []  # BYOK bypasses our quota entirely


def test_byok_call_works_without_auth(monkeypatch):
    """A tokenless (local) user may relay BYOK — no auth required for that path."""
    calls, enforce = _recorder()
    client = _app(monkeypatch, enforce, uid=None)  # no signed-in user
    res = client.post("/_probe", headers={"X-Provider-Key": "sk-user"})
    assert res.status_code == 200
    assert calls == []


def test_byok_call_over_ip_cap_is_429(monkeypatch):
    """The unauthenticated BYOK relay is guarded by a per-IP cap."""
    calls, enforce = _recorder()
    client = _app(monkeypatch, enforce, uid=None, redis=_FakeRedis(ip_over=True))
    res = client.post("/_probe", headers={"X-Provider-Key": "sk-user"})
    assert res.status_code == 429


def test_managed_call_without_auth_is_401(monkeypatch):
    """A managed call (no provider key) with no user is rejected."""
    calls, enforce = _recorder()
    client = _app(monkeypatch, enforce, uid=None)
    res = client.post("/_probe", headers={"X-Run-Id": "run-1"})
    assert res.status_code == 401
    assert calls == []


def test_over_quota_first_call_returns_429(monkeypatch):
    """When the quota is exhausted, the run's first call is rejected."""
    async def enforce(_request, _uid):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "slow down")

    res = _app(monkeypatch, enforce).post("/_probe", headers={"X-Run-Id": "run-x"})
    assert res.status_code == 429
