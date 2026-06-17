from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SourceResponse(BaseModel):
    id: str
    user_id: str
    topic_id: str
    original_filename: str
    file_type: str  # pdf, txt
    file_size: int  # Bytes
    total_chunks: int
    chunking_status: str  # PENDING → PROCESSING → COMPLETED | FAILED
    ingested_at: datetime


class DocumentChunkResponse(BaseModel):
    id: str
    source_id: str
    chunk_index: int
    text: str  # Preview of chunk text
    page_number: int
    embedding_status: str  # PENDING | COMPLETED | FAILED
    tokens: Optional[int] = None
    created_at: datetime


class ChunkingProgressResponse(BaseModel):
    source_id: str
    total_chunks: int
    completed_chunks: int
    status: str  # PENDING | PROCESSING | COMPLETED | FAILED
