from typing import Optional

from pydantic import BaseModel


class QueryRequest(BaseModel):
    query: str
    topic_id: Optional[str] = None
    topic_query: Optional[str] = None
    top_k: int = 7
    synthesize: bool = True


class QueryResultItem(BaseModel):
    source_type: str  # "document_chunk" | "journal_entry"
    text: str
    score: float
    metadata: dict


class QueryResponse(BaseModel):
    query: str
    results: list[QueryResultItem]
    answer: Optional[str] = None
