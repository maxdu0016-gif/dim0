"""Embedding class."""

import asyncio
import logging

from openai import AsyncOpenAI

from topix.config.config import Config
from topix.nlp.tokens import truncate_to_tokens
from topix.utils.timeit import async_timeit

logger = logging.getLogger(__name__)

MODEL_NAME = "text-embedding-3-small"
DIMENSIONS = 512

# Hard per-input limit for `text-embedding-3-small` is 8191 tokens; cap a touch
# below it so any counting drift still lands inside the limit. Oversized inputs
# (long sheets, mini-app JSX, non-English notes) are truncated rather than
# allowed to 400 the whole embed request.
MAX_EMBED_TOKENS = 8000


class OpenAIEmbedder:
    """A class to handle OpenAI embeddings using the OpenAI API."""

    def __init__(self, api_key: str | None = None):
        """Initialize the OpenAIEmbedder."""
        self._client = AsyncOpenAI(api_key=api_key)

    @classmethod
    def from_config(cls):
        """Create an instance of OpenAIEmbedder from configuration."""
        return cls(api_key=Config.instance().run.apis.openai.api_key.get_secret_value())

    def _fit(self, text: str) -> str:
        """Clamp one text to the embedding model's per-input token limit.

        Logs a warning when truncation actually happens so we have visibility
        into how often oversized content is being clipped (and on what).
        """
        fitted = truncate_to_tokens(text, MAX_EMBED_TOKENS)
        if len(fitted) != len(text):
            logger.warning(
                "Truncated embedding input to %d tokens (was %d chars, now %d chars)",
                MAX_EMBED_TOKENS, len(text), len(fitted),
            )
        return fitted

    @async_timeit
    async def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        texts = [self._fit(text) if text else "$" for text in texts]
        # Call the embeddings endpoint asynchronously
        response = await self._client.embeddings.create(
            model=MODEL_NAME,
            input=texts,
            dimensions=DIMENSIONS
        )
        # The embeddings are in response.data, ordered same as input
        return [e.embedding for e in response.data]

    async def embed(
        self,
        texts: list[str],
        batch_size: int = 1000
    ) -> list[list[float]]:
        """Embed a list of texts using OpenAI embeddings."""
        if not texts:
            return []

        tasks = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            task = asyncio.create_task(self._embed_batch(batch))
            tasks.append(task)
        results = await asyncio.gather(*tasks)

        # Flatten the list of lists into a single list
        embeddings = [embedding for batch in results for embedding in batch]

        return embeddings
