"""
GenAI Adapter — Client initialisation + optional thinking-config injector.

This module provides a thin adapter around the ``google.genai`` SDK that
pulls baseline configuration from environment variables.

* The client is lazily initialised using ``GEMINI_API_KEY``.
* The text model defaults to ``GEMINI_MODEL`` (or an explicit override).
* If ``AI_THINKING_LEVEL`` is set, a ``thinking_config`` block is injected
  into the generation config with ``thinking_level`` as a lowercase string.
* The ``config`` parameter is **fully optional** — when omitted, the
  environment defaults are applied directly before the ``generate_content``
  call.
* User-supplied config keys are merged **on top of** the environment
  baseline using the spread pattern ``{**baseline, **config}``, so custom
  settings always win.

Async variants (``generate_text_async`` / ``generate_text_stream_async``)
use ``asyncio.to_thread()`` to run the synchronous SDK calls on a thread
pool, preventing the FastAPI event loop from being blocked during
long-running Gemini API calls.

Embeddings are **not** handled here — they live in
``app.modules.embeddings.service`` and use a separate model.
"""

import asyncio
from typing import Any, AsyncGenerator, Optional

from google import genai

from app.core.config import settings

# ---------------------------------------------------------------------------
# Module-level lazy client
# ---------------------------------------------------------------------------

_client: Optional[genai.Client] = None



def get_client() -> genai.Client:
    """Return a lazily-initialised, shared ``genai.Client`` instance.

    All services that need a GenAI client should call this instead of
    creating their own ``genai.Client(...)`` — this ensures a single
    shared instance is reused across the application.

    The client reads ``GEMINI_API_KEY`` from the environment.
    """
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def with_thinking(
    config: Optional[dict[str, Any]] = None,
) -> Optional[dict[str, Any]]:
    """Wrap a generation ``config`` with the ``thinking_config`` block
    read from the ``AI_THINKING_LEVEL`` environment variable.

    When ``AI_THINKING_LEVEL`` is empty / unset, returns ``config``
    unchanged (``None`` when no config was given) — the model's own
    default thinking behaviour applies.

    When ``AI_THINKING_LEVEL`` is set, injects the ``thinking_config``
    block at the structural path ``config["thinking_config"]["thinking_level"]``
    as a lowercase string (e.g. ``"low"``, ``"medium"``, ``"high"``).
    Any user-supplied config keys are merged **on top**, so they win.

    Examples
    --------
    .. code-block:: python

        # No user config, env is empty → None (SDK default)
        config = with_thinking()

        # No user config, env="medium" → {"thinking_config": ...}
        config = with_thinking()

        # User config + env="medium" → merged, user keys win
        config = with_thinking({"response_mime_type": "application/json"})
    """
    baseline = _build_thinking_config()
    if not baseline:
        return config
    if config is None:
        return baseline
    return {**baseline, **config}


def generate_text(
    prompt: str,
    *,
    model: Optional[str] = None,
    config: Optional[dict[str, Any]] = None,
) -> str:
    """Send a text prompt to the GenAI model and return the response string.

    This is the primary entry-point for **text-generation** in the backend.
    Embedding calls go through ``EmbeddingsService`` instead.

    Parameters
    ----------
    prompt:
        The text prompt to send to the model.
    model:
        Optional model name override. Falls back to ``GEMINI_MODEL``.
    config:
        **Optional** generation configuration dict. When ``None`` or omitted,
        the function reads ``AI_THINKING_LEVEL`` from the environment and
        applies the appropriate ``thinking_config`` block directly.

        When supplied, the user's dict is merged **on top of** the
        environment baseline, so custom keys always win::

            merged = {**env_baseline, **user_config}

        The thinking constraint lives at the structural path:
        ``config["thinking_config"]["thinking_level"]`` as a lowercase
        string value (e.g. ``"low"``, ``"medium"``, ``"high"``).

    Returns
    -------
    The model's response text, stripped of leading/trailing whitespace.
    Returns an empty string if the model returns no content.

    Examples
    --------
    .. code-block:: python

        # Minimal — all defaults from env vars
        answer = generate_text("Explain quantum computing")

        # Override model + custom config
        answer = generate_text(
            "Explain quantum computing",
            model="gemini-2.0-flash",
            config={"response_mime_type": "application/json"},
        )
    """
    client = get_client()
    resolved_model = model or settings.gemini_model
    baseline = _build_thinking_config()
    merged_config = {**baseline, **(config or {})}

    response = client.models.generate_content(
        model=resolved_model,
        contents=prompt,
        config=merged_config if merged_config else None,  # type: ignore[arg-type]
    )

    return response.text.strip() if response.text else ""


# ---------------------------------------------------------------------------
# Async variants — run sync SDK calls on a thread pool so they don't block
# the FastAPI event loop.  Use these in all async route handlers.
# ---------------------------------------------------------------------------


async def generate_text_async(
    prompt: str,
    *,
    model: Optional[str] = None,
    config: Optional[dict[str, Any]] = None,
) -> str:
    """Non-blocking version of ``generate_text``.

    Runs the synchronous SDK call via ``asyncio.to_thread()`` so the
    event loop can process other requests while waiting for the Gemini
    API response.

    Parameters are identical to ``generate_text``.
    """
    client = get_client()
    resolved_model = model or settings.gemini_model
    baseline = _build_thinking_config()
    merged_config = {**baseline, **(config or {})}

    def _call() -> str:
        response = client.models.generate_content(
            model=resolved_model,
            contents=prompt,
            config=merged_config if merged_config else None,  # type: ignore[arg-type]
        )
        return response.text.strip() if response.text else ""

    return await asyncio.to_thread(_call)


async def generate_text_stream_async(
    prompt: str,
    *,
    model: Optional[str] = None,
    config: Optional[dict[str, Any]] = None,
) -> AsyncGenerator[str, None]:
    """Stream Gemini response tokens asynchronously via Server-Sent Events.

    Each yielded string is a single text token from the model.  Use this
    with FastAPI's ``StreamingResponse`` to provide a real-time streaming
    UX to the frontend.

    Parameters are identical to ``generate_text``.

    Yields
    ------
    Text tokens from the model response, one per iteration.
    """
    client = get_client()
    resolved_model = model or settings.gemini_model
    baseline = _build_thinking_config()
    merged_config = {**baseline, **(config or {})}

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[Optional[str]] = asyncio.Queue()

    def _producer() -> None:
        """Run the sync streaming iterator in a thread, pushing tokens
        to the asyncio queue as they arrive."""
        try:
            response = client.models.generate_content(
                model=resolved_model,
                contents=prompt,
                config=merged_config if merged_config else None,  # type: ignore[arg-type]
                stream=True,
            )
            for chunk in response:
                if chunk.text:
                    loop.call_soon_threadsafe(queue.put_nowait, chunk.text)
        except Exception as exc:
            loop.call_soon_threadsafe(queue.put_nowait, exc)
            return
        loop.call_soon_threadsafe(queue.put_nowait, None)

    loop.run_in_executor(None, _producer)

    while True:
        chunk = await queue.get()
        if chunk is None:
            break  # Stream complete
        if isinstance(chunk, Exception):
            raise chunk
        yield chunk


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _build_thinking_config() -> dict[str, Any]:
    """Build the ``thinking_config`` block from the ``AI_THINKING_LEVEL`` env var.

    The thinking constraint is placed at the structural path:
    ``thinking_config.thinking_level`` with a **completely lowercase string
    value** that the Google client payload expects.

    Accepted env values
    -------------------
    ``"disabled"`` / empty
        No thinking override — returns ``{}``.
    ``"enabled"``
        Enables thinking with level ``"medium"`` (sensible default).
    ``"minimal"`` | ``"low"`` | ``"medium"`` | ``"high"``
        Passes the level string through directly (Gemma models).
    A positive integer (e.g. ``"1024"``)
        Uses ``thinking_budget`` instead of ``thinking_level``
        (models that support token-budget reasoning).

    Returns
    -------
    A dict that can be safely spread into a generation config.
    Returns ``{}`` when no override is needed.
    """
    raw = settings.ai_thinking_level
    if not raw:
        return {}

    val = raw.strip().lower()

    # ── Explicit disable ───────────────────────────────────────────────
    if val == "disabled":
        return {}

    # ── Thinking level (Gemma: lowercase string) ────────────────────────
    known_levels = {"minimal", "low", "medium", "high"}
    if val == "enabled":
        return {"thinking_config": {"thinking_level": "medium"}}
    if val in known_levels:
        return {"thinking_config": {"thinking_level": val}}

    # ── Thinking budget (integer token budget) ─────────────────────────
    try:
        budget = int(val)
        if budget > 0:
            return {"thinking_config": {"thinking_budget": budget}}
    except ValueError:
        pass

    # ── Unrecognised value — silently ignore ───────────────────────────
    return {}
