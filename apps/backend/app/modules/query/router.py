from fastapi import APIRouter, Depends

from app.db.client import DatabaseClient
from app.modules.auth.deps import require_user
from app.modules.query.dto import QueryRequest, QueryResponse
from app.modules.query.service import QueryService
from app.modules.users.dto import UserResponse

router = APIRouter(prefix="/query", tags=["query"])


def get_query_service() -> QueryService:
    return QueryService(DatabaseClient)


@router.post("/", response_model=QueryResponse)
async def search_knowledge(
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
