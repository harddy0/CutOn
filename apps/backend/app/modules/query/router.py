import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.core.genai_adapter import generate_text_stream_async, with_thinking
from app.db.client import DatabaseClient
from app.modules.auth.deps import require_user
from app.modules.auth.limiter import limiter
from app.modules.query.dto import QueryRequest, QueryResponse
from app.modules.query.service import CONTEXT_SYNTHESIS_PROMPT, QueryService
from app.modules.users.dto import UserResponse

router = APIRouter(prefix="/query", tags=["query"])


def get_query_service() -> QueryService:
    return QueryService(DatabaseClient)


@router.post("/", response_model=QueryResponse)
@limiter.limit("30/minute")
async def search_knowledge(
    request: Request,
    payload: QueryRequest,
    service: QueryService = Depends(get_query_service),
    current_user: UserResponse = Depends(require_user),
):
    """Hybrid semantic search across your uploaded documents and journal entries.

    The query is vectorised using the same Gemini embedding model that
    generated the stored vectors, then a **dual concurrent** ``$vectorSearch``
    is executed against **both** indexes:

    * ``vector_index_chunks`` — your PDF/doc/txt document chunks
    * ``vector_index_journals`` — your personal journal entries

    Results are merged and sorted by cosine similarity score (descending).

    **Topic scoping**
    You can scope the search to a specific topic in one of two ways:

    1. ``topic_id`` — a direct MongoDB ObjectId (explicit, fastest)
    2. ``topic_query`` — a natural-language description like
       "React state management" that resolves to the closest topic
       via embedding similarity

    If neither is provided, the search runs across **all** your topics.
    """
    return await service.search(current_user.id, payload)


@router.post("/stream")
@limiter.limit("30/minute")
async def search_knowledge_stream(
    request: Request,
    payload: QueryRequest,
    service: QueryService = Depends(get_query_service),
    current_user: UserResponse = Depends(require_user),
):
    """Hybrid search with a **streaming** LLM synthesis response.

    Same search logic as ``POST /query/`` but the synthesised answer is
    returned as a **Server-Sent Events** (SSE) stream so the frontend can
    display tokens incrementally as they arrive from Gemini.

    **SSE Event Types**\n
    * ``token`` — a single text chunk from the model.\n
    * ``done`` — signals that streaming is complete.\n
    * ``error`` — an error occurred during streaming (JSON body).

    **Note**: the search results are still returned as a normal JSON payload
    *before* the streaming answer begins, so the frontend can show source
    citations immediately.
    """
    # 1. Run the search (non-streaming part — results + context)
    query_response = await service.search(current_user.id, payload)
    results = query_response.results
    query_text = query_response.query

    # 2. Format context for the LLM
    context = service._format_context(results)
    prompt = CONTEXT_SYNTHESIS_PROMPT.format(
        context=context, query=query_text
    )

    # 3. SSE generator — stream tokens from Gemini
    async def event_stream():
        yield f"data: {json.dumps({'type': 'results', 'results': [r.model_dump() for r in results]})}\n\n"

        try:
            async for token in generate_text_stream_async(
                prompt,
                model=settings.gemini_model,
                config=with_thinking(),  # type: ignore[arg-type]
            ):
                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"
            yield "data: {\"type\": \"done\"}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
