"""Router tests for the sharing endpoints — gating + body validation."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from topix.api.router.sharing import router
from topix.api.utils.security import get_current_user_uid, verify_board_owner


class _AsyncAcquire:
    """asyncpg pool.acquire() returns this; it's an async context manager."""

    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *args):
        return False


class _FakePool:
    def __init__(self, conn):
        self._conn = conn

    def acquire(self):
        return _AsyncAcquire(self._conn)


class _FakeGraphStore:
    def __init__(self):
        self.fake_conn = AsyncMock()
        self._pg_pool = _FakePool(self.fake_conn)

    # Required by verify_board_owner — not used in tests that override the dep.
    async def get_graph_role(self, graph_uid, user_uid):
        return "owner"


def _build_client(*, user_uid: str = "u1", is_owner: bool = True) -> tuple[TestClient, FastAPI]:
    app = FastAPI()
    app.include_router(router)
    app.graph_store = _FakeGraphStore()

    async def _fake_current_user_uid():
        return user_uid

    async def _fake_verify_owner():
        if not is_owner:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Board not found")

    app.dependency_overrides[get_current_user_uid] = _fake_current_user_uid
    app.dependency_overrides[verify_board_owner] = _fake_verify_owner
    return TestClient(app), app


# ---------------------------------------------------------------------------
# Owner endpoints
# ---------------------------------------------------------------------------


def test_mint_share_link_returns_token(monkeypatch):
    from topix.api.router import sharing as sharing_router

    monkeypatch.setattr(
        sharing_router.links, "mint_link", AsyncMock(return_value="abc123token"),
    )

    client, _ = _build_client()
    response = client.post("/boards/b1/share-links", json={"role": "member"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["data"]["token"] == "abc123token"
    assert body["data"]["role"] == "member"


def test_mint_share_link_rejects_invalid_role(monkeypatch):
    from topix.api.router import sharing as sharing_router

    monkeypatch.setattr(sharing_router.links, "mint_link", AsyncMock())

    client, _ = _build_client()
    response = client.post("/boards/b1/share-links", json={"role": "admin"})

    assert response.status_code == 400


def test_mint_share_link_rejected_when_not_owner():
    client, _ = _build_client(is_owner=False)
    response = client.post("/boards/b1/share-links", json={"role": "member"})

    # verify_board_owner returns 404 to avoid leaking existence.
    assert response.status_code == 404


def test_list_share_links_returns_active_set(monkeypatch):
    from topix.api.router import sharing as sharing_router

    monkeypatch.setattr(
        sharing_router.links, "list_active_links",
        AsyncMock(return_value=[
            {"token": "t1", "role": "member", "created_at": "2026-05-28T10:00:00"},
            {"token": "t2", "role": "viewer", "created_at": "2026-05-28T09:00:00"},
        ]),
    )

    client, _ = _build_client()
    response = client.get("/boards/b1/share-links")

    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]["links"]) == 2
    assert body["data"]["links"][0]["token"] == "t1"


def test_delete_share_link_revokes(monkeypatch):
    from topix.api.router import sharing as sharing_router

    revoke_mock = AsyncMock(return_value=True)
    monkeypatch.setattr(sharing_router.links, "revoke", revoke_mock)

    client, _ = _build_client()
    response = client.delete("/boards/b1/share-links/some-token")

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["revoked"] is True
    revoke_mock.assert_awaited_once()


def test_revoke_all_share_links_returns_count(monkeypatch):
    from topix.api.router import sharing as sharing_router

    monkeypatch.setattr(
        sharing_router.links, "revoke_all", AsyncMock(return_value=3),
    )

    client, _ = _build_client()
    response = client.delete("/boards/b1/share-links")

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["revoked_count"] == 3


# ---------------------------------------------------------------------------
# Recipient endpoints
# ---------------------------------------------------------------------------


def test_preview_returns_graph_uid_and_role(monkeypatch):
    from topix.api.router import sharing as sharing_router

    monkeypatch.setattr(
        sharing_router.links, "preview",
        AsyncMock(return_value={"graph_uid": "b1", "role": "viewer"}),
    )

    client, _ = _build_client()
    response = client.get("/share-links/some-token/preview")

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["graph_uid"] == "b1"
    assert body["data"]["role"] == "viewer"


def test_preview_404_when_token_unknown(monkeypatch):
    from topix.api.router import sharing as sharing_router

    monkeypatch.setattr(sharing_router.links, "preview", AsyncMock(return_value=None))

    client, _ = _build_client()
    response = client.get("/share-links/nope/preview")

    assert response.status_code == 404


def test_accept_creates_membership_and_returns_role(monkeypatch):
    from topix.api.router import sharing as sharing_router

    monkeypatch.setattr(
        sharing_router.acceptance, "accept_link",
        AsyncMock(return_value={
            "graph_uid": "b1", "role": "member", "already_member": False,
        }),
    )

    client, _ = _build_client()
    response = client.post("/share-links/some-token/accept")

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["graph_uid"] == "b1"
    assert body["data"]["role"] == "member"
    assert body["data"]["already_member"] is False


def test_accept_404_when_token_unknown(monkeypatch):
    from topix.api.router import sharing as sharing_router

    monkeypatch.setattr(sharing_router.acceptance, "accept_link", AsyncMock(return_value=None))

    client, _ = _build_client()
    response = client.post("/share-links/nope/accept")

    assert response.status_code == 404


def test_accept_requires_authentication():
    """Without get_current_user_uid override, the endpoint should 401."""
    app = FastAPI()
    app.include_router(router)
    app.graph_store = _FakeGraphStore()
    client = TestClient(app)

    response = client.post("/share-links/some-token/accept")

    # No JWT → OAuth2PasswordBearer raises 401.
    assert response.status_code == 401
