"""Sharing router — share-link mint / list / revoke + accept + preview.

Member-management endpoints (`GET /boards/{id}/members`,
`DELETE /boards/{id}/members/{user_id}`) and the revoke-triggers-kick
behavior land in Slice 3.
"""

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Path, Request, Response

from topix.api.utils.decorators import with_standard_response
from topix.api.utils.security import (
    get_current_user_uid,
    verify_board_owner,
)
from topix.sharing import acceptance, links
from topix.store.graph import GraphStore


logger = logging.getLogger(__name__)


router = APIRouter(
    tags=["sharing"],
    responses={404: {"description": "Not found"}},
)


# ---------------------------------------------------------------------------
# Owner-side endpoints — prefix `/boards/{graph_id}/share-links`
# ---------------------------------------------------------------------------


@router.post("/boards/{graph_id}/share-links/", include_in_schema=False)
@router.post("/boards/{graph_id}/share-links")
@with_standard_response
async def mint_share_link(
    response: Response,
    request: Request,
    graph_id: Annotated[str, Path(description="Graph ID")],
    user_id: Annotated[str, Depends(get_current_user_uid)],
    _: Annotated[None, Depends(verify_board_owner)],
    body: Annotated[
        dict, Body(description="{ role: 'member' | 'viewer' }"),
    ],
):
    """Mint a new share link with the requested role. Owner-only."""
    role = body.get("role")
    if role not in ("member", "viewer"):
        raise HTTPException(status_code=400, detail="role must be 'member' or 'viewer'")

    store: GraphStore = request.app.graph_store
    async with store._pg_pool.acquire() as conn:
        token = await links.mint_link(
            conn, graph_uid=graph_id, role=role, created_by_uid=user_id,
        )
    return {"token": token, "role": role}


@router.get("/boards/{graph_id}/share-links/", include_in_schema=False)
@router.get("/boards/{graph_id}/share-links")
@with_standard_response
async def list_share_links(
    response: Response,
    request: Request,
    graph_id: Annotated[str, Path(description="Graph ID")],
    user_id: Annotated[str, Depends(get_current_user_uid)],
    _: Annotated[None, Depends(verify_board_owner)],
):
    """List active share links for this board (owner-only)."""
    store: GraphStore = request.app.graph_store
    async with store._pg_pool.acquire() as conn:
        rows = await links.list_active_links(conn, graph_uid=graph_id)
    return {"links": rows}


@router.delete("/boards/{graph_id}/share-links/{token}/", include_in_schema=False)
@router.delete("/boards/{graph_id}/share-links/{token}")
@with_standard_response
async def delete_share_link(
    response: Response,
    request: Request,
    graph_id: Annotated[str, Path(description="Graph ID")],
    token: Annotated[str, Path(description="Share link token to revoke")],
    user_id: Annotated[str, Depends(get_current_user_uid)],
    _: Annotated[None, Depends(verify_board_owner)],
):
    """Revoke a single share link. Owner-only. Idempotent."""
    store: GraphStore = request.app.graph_store
    async with store._pg_pool.acquire() as conn:
        revoked = await links.revoke(conn, graph_uid=graph_id, token=token)
    return {"revoked": revoked}


@router.delete("/boards/{graph_id}/share-links/", include_in_schema=False)
@router.delete("/boards/{graph_id}/share-links")
@with_standard_response
async def revoke_all_share_links(
    response: Response,
    request: Request,
    graph_id: Annotated[str, Path(description="Graph ID")],
    user_id: Annotated[str, Depends(get_current_user_uid)],
    _: Annotated[None, Depends(verify_board_owner)],
):
    """Revoke EVERY active share link on this board. Owner-only.

    Used by the "Disable sharing" button in the share dialog. Existing
    memberships are NOT removed — only future accepts are blocked.
    """
    store: GraphStore = request.app.graph_store
    async with store._pg_pool.acquire() as conn:
        count = await links.revoke_all(conn, graph_uid=graph_id)
    return {"revoked_count": count}


# ---------------------------------------------------------------------------
# Recipient-side endpoints — prefix `/share-links/{token}`
# ---------------------------------------------------------------------------


@router.get("/share-links/{token}/preview/", include_in_schema=False)
@router.get("/share-links/{token}/preview")
@with_standard_response
async def preview_share_link(
    response: Response,
    request: Request,
    token: Annotated[str, Path(description="Share link token")],
):
    """Peek at what the link grants without consuming it.

    Intentionally unauthenticated — the landing page renders the
    preview before a sign-up commitment. Returns 404 if the link is
    unknown or revoked.
    """
    store: GraphStore = request.app.graph_store
    async with store._pg_pool.acquire() as conn:
        info = await links.preview(conn, token=token)
    if info is None:
        raise HTTPException(status_code=404, detail="Share link not found or revoked")
    return {"graph_uid": info["graph_uid"], "role": info["role"]}


@router.post("/share-links/{token}/accept/", include_in_schema=False)
@router.post("/share-links/{token}/accept")
@with_standard_response
async def accept_share_link(
    response: Response,
    request: Request,
    token: Annotated[str, Path(description="Share link token")],
    user_id: Annotated[str, Depends(get_current_user_uid)],
):
    """Consume a share link for the signed-in user.

    Idempotent: re-clicking the same link as an existing member is a
    no-op. Returns the board's uid + the user's effective role
    post-accept.
    """
    store: GraphStore = request.app.graph_store
    async with store._pg_pool.acquire() as conn:
        result = await acceptance.accept_link(conn, token=token, user_uid=user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Share link not found or revoked")
    return result
