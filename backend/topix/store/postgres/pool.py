"""Async Postgres connection pool for topix."""

import asyncpg

from topix.config.config import Config


async def create_pool(
    *,
    min_size: int = 5,
    max_size: int = 25,
    timeout: float = 10.0,
    command_timeout: float = 30.0,
) -> asyncpg.Pool:
    """Create a new Postgres connection pool.

    Defaults are tuned so a single shared pool fits comfortably under typical
    Postgres ``max_connections`` ceilings while keeping a warm baseline of
    connections to avoid paying the connect handshake on bursty traffic.
    """
    config = Config.instance()
    postgres_url = config.run.databases.postgres.dsn()
    return await asyncpg.create_pool(
        postgres_url,
        min_size=min_size,
        max_size=max_size,
        timeout=timeout,
        command_timeout=command_timeout,
    )
