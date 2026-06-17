from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form

from app.db.client import DatabaseClient
from app.modules.auth.deps import require_user
from app.modules.documents.dto import (
    ChunkingProgressResponse,
    DocumentChunkResponse,
    SourceResponse,
)
from app.modules.documents.service import DocumentsService
from app.modules.users.dto import UserResponse

router = APIRouter(prefix="/sources", tags=["sources"])


def get_documents_service() -> DocumentsService:
    return DocumentsService(DatabaseClient)


@router.post("/upload", response_model=SourceResponse, status_code=202)
async def upload_document(
    topic_id: str = Form(...),
    file: UploadFile = File(...),
    service: DocumentsService = Depends(get_documents_service),
    current_user: UserResponse = Depends(require_user),
):
    """Upload a PDF or TXT file for ingestion and embedding.

    Returns **202 Accepted** immediately.  The file is parsed, chunked, and
    stored.  Background Celery workers generate embeddings for each chunk.
    Poll ``GET /sources/{source_id}/chunks`` to track progress.
    """
    return await service.upload(current_user.id, topic_id, file)


@router.get("/", response_model=list[SourceResponse])
async def list_sources(
    topic_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    service: DocumentsService = Depends(get_documents_service),
    current_user: UserResponse = Depends(require_user),
):
    if topic_id:
        return await service.list_by_topic(current_user.id, topic_id, skip, limit)
    return await service.list_by_user(current_user.id, skip, limit)


@router.get("/{source_id}", response_model=SourceResponse)
async def get_source(
    source_id: str,
    service: DocumentsService = Depends(get_documents_service),
    current_user: UserResponse = Depends(require_user),
):
    return await service.get_source(source_id, current_user.id)


@router.delete("/{source_id}", status_code=204)
async def delete_source(
    source_id: str,
    service: DocumentsService = Depends(get_documents_service),
    current_user: UserResponse = Depends(require_user),
):
    await service.delete_source(source_id, current_user.id)


@router.get("/{source_id}/chunks", response_model=list[DocumentChunkResponse])
async def list_chunks(
    source_id: str,
    skip: int = 0,
    limit: int = 200,
    service: DocumentsService = Depends(get_documents_service),
    current_user: UserResponse = Depends(require_user),
):
    return await service.get_chunks(source_id, current_user.id, skip, limit)


@router.get("/{source_id}/progress", response_model=ChunkingProgressResponse)
async def get_progress(
    source_id: str,
    service: DocumentsService = Depends(get_documents_service),
    current_user: UserResponse = Depends(require_user),
):
    return await service.get_progress(source_id, current_user.id)
