import asyncio
from typing import Optional

from google import genai

from app.core.config import settings


class EmbeddingsService:
    """Service that generates text embeddings via Google's Gemini Embedding API.

    This service has **no public router** — it is designed to be injected into
    other service modules (e.g. journal, document chunks) that need to embed
    text before storing vectors.

    All public methods are **async** — they run the synchronous SDK calls on
    a thread pool via ``asyncio.to_thread()`` so the FastAPI event loop is
    never blocked.
    """

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None) -> None:
        self._api_key = api_key or settings.gemini_api_key
        self._model = model or settings.embedding_model
        self._client: Optional[genai.Client] = None

    # ------------------------------------------------------------------
    # Lazy client — only initialised when the first embedding is requested,
    # so the service can be imported/instantiated without a live API key.
    # ------------------------------------------------------------------

    @property
    def _client_instance(self) -> genai.Client:
        if self._client is None:
            self._client = genai.Client(api_key=self._api_key)
        return self._client

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def embed_text(self, text: str) -> list[float]:
        """Generate an embedding vector for a single text string.

        Runs the synchronous SDK call via ``asyncio.to_thread()`` so the
        event loop can process other requests while the embedding is
        computed.

        Parameters
        ----------
        text:
            The text content to embed.

        Returns
        -------
        A list of floats representing the embedding vector (default 3072
        dimensions for ``gemini-embedding-2-flash``).
        """
        client = self._client_instance

        def _call() -> list[float]:
            result = client.models.embed_content(
                model=self._model,
                contents=text,
            )
            return result.embeddings[0].values  # type: ignore

        return await asyncio.to_thread(_call)
