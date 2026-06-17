import hashlib
import os
import tempfile
from datetime import datetime

from bson import ObjectId
from fastapi import HTTPException, UploadFile
from pymongo.asynchronous.collection import AsyncCollection
from app.core.config import settings
from app.db.client import DatabaseClient
from app.modules.documents.chunker import Chunk, chunk_text
from app.modules.documents.dto import (
    ChunkingProgressResponse,
    DocumentChunkResponse,
    SourceResponse,
)
from app.modules.documents.parser import PageResult, parse_file
from app.tasks.documents import EMBEDDINGS_QUEUE, generate_document_chunk_embedding


ALLOWED_TYPES = {"pdf", "docx", "txt"}


class DocumentsService:
    def __init__(self, db_client: type[DatabaseClient]) -> None:
        self._db = db_client

    # ------------------------------------------------------------------ helpers

    @property
    def _sources_collection(self) -> AsyncCollection:
        coll = self._db.sources
        assert coll is not None, "Database not connected"
        return coll

    @property
    def _chunks_collection(self) -> AsyncCollection:
        coll = self._db.document_chunks
        assert coll is not None, "Database not connected"
        return coll

    @staticmethod
    def _format_source(doc: dict) -> SourceResponse:
        return SourceResponse(
            id=str(doc["_id"]),
            user_id=str(doc["user_id"]),
            topic_id=str(doc["topic_id"]),
            original_filename=doc["original_filename"],
            file_type=doc["file_type"],
            file_size=doc["file_size"],
            total_chunks=doc["total_chunks"],
            chunking_status=doc.get("chunking_status", "PENDING"),
            ingested_at=doc["ingested_at"],
        )

    @staticmethod
    def _format_chunk(doc: dict) -> DocumentChunkResponse:
        metadata = doc.get("metadata", {})
        return DocumentChunkResponse(
            id=str(doc["_id"]),
            source_id=str(doc["source_id"]),
            chunk_index=doc["chunk_index"],
            text=doc["text"][:500],  # Preview only
            page_number=metadata.get("page_number", 1),
            embedding_status=doc.get("embedding_status", "PENDING"),
            tokens=metadata.get("tokens"),
            created_at=doc["created_at"],
        )

    @staticmethod
    def _detect_file_type(filename: str) -> str:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in ALLOWED_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_TYPES))}",
            )
        return ext

    @staticmethod
    def _compute_file_hash(file_path: str) -> str:
        """SHA-256 hash of the raw file for deduplication."""
        sha = hashlib.sha256()
        with open(file_path, "rb") as f:
            while True:
                block = f.read(65536)
                if not block:
                    break
                sha.update(block)
        return sha.hexdigest()

    # ------------------------------------------------------------------ ownership

    async def _assert_source_owner(self, source_id: str, user_id: str) -> dict:
        coll = self._sources_collection
        doc = await coll.find_one({"_id": ObjectId(source_id)})
        if doc is None:
            raise HTTPException(status_code=404, detail="Source document not found")
        if str(doc["user_id"]) != user_id:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action on this source",
            )
        return dict(doc)

    # ------------------------------------------------------------------ upload

    async def upload(
        self,
        user_id: str,
        topic_id: str,
        file: UploadFile,
    ) -> SourceResponse:
        """Upload a file, extract text, chunk it, and enqueue background embedding.

        Flow:
        1. Save file to temp location
        2. Detect file type & compute hash (dedup check)
        3. Parse file → pages of text
        4. Create SourceDocument (chunking_status: PROCESSING)
        5. Chunk text → bulk insert DocumentChunkDocuments (embedding_status: PENDING)
        6. Delete temp file
        7. Enqueue one Celery task per chunk for embedding
        8. Return SourceResponse (202)
        """
        # 1. Basic validation
        file_type = self._detect_file_type(file.filename or "unknown")
        file_size = 0

        # 2. Save to temp
        tmp = None
        try:
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_type}")
            content = await file.read()
            file_size = len(content)
            # Check max upload size
            max_bytes = settings.max_upload_size_mb * 1024 * 1024
            if file_size > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Max {settings.max_upload_size_mb} MB.",
                )

            tmp.write(content)
            tmp.flush()
            tmp.close()  # close so parser can open it

            tmp_path = tmp.name

            # 3. Compute hash for dedup
            file_hash = self._compute_file_hash(tmp_path)

            # 4. Check for duplicate (same user, same hash, same topic)
            existing = await self._sources_collection.find_one(
                {"user_id": ObjectId(user_id), "topic_id": ObjectId(topic_id), "file_hash": file_hash}
            )
            if existing:
                os.unlink(tmp_path)
                raise HTTPException(
                    status_code=409,
                    detail="This file has already been uploaded to this topic.",
                )

            # 5. Parse file
            pages: list[PageResult] = parse_file(tmp_path, file_type)

            if not pages:
                os.unlink(tmp_path)
                raise HTTPException(
                    status_code=400,
                    detail="No extractable text found in the file.",
                )

            # 6. Chunk text
            chunks: list[Chunk] = chunk_text(pages)

            if not chunks:
                os.unlink(tmp_path)
                raise HTTPException(
                    status_code=400,
                    detail="No chunks could be generated from the file.",
                )

            # 7. Create SourceDocument
            now = datetime.utcnow()
            source_doc = {
                "user_id": ObjectId(user_id),
                "topic_id": ObjectId(topic_id),
                "original_filename": file.filename or "unknown",
                "file_type": file_type,
                "file_size": file_size,
                "filename": file.filename or "unknown",
                "file_hash": file_hash,
                "total_chunks": len(chunks),
                "chunking_status": "PROCESSING",
                "ingested_at": now,
            }
            source_result = await self._sources_collection.insert_one(source_doc)
            source_id = source_result.inserted_id
            source_doc["_id"] = source_id

            # 8. Bulk insert chunk documents
            chunk_docs = []
            for i, chunk in enumerate(chunks):
                chunk_docs.append({
                    "user_id": ObjectId(user_id),
                    "topic_id": ObjectId(topic_id),
                    "source_id": source_id,
                    "chunk_index": i,
                    "metadata": {
                        "page_number": chunk.page_number,
                        "page_range": chunk.page_range,
                        "tokens": chunk.tokens,
                    },
                    "text": chunk.text,
                    "embedding": [],
                    "chunk_hash": chunk.chunk_hash,
                    "embedding_model": settings.embedding_model,
                    "embedding_status": "PENDING",
                    "retry_count": 0,
                    "last_error": None,
                    "start_char": chunk.start_char,
                    "end_char": chunk.end_char,
                    "created_at": now,
                })

            await self._chunks_collection.insert_many(chunk_docs)

            # 9. Delete temp file (no permanent storage)
            os.unlink(tmp_path)

        except Exception:
            # Cleanup temp file on error
            if tmp is not None:
                try:
                    os.unlink(tmp.name)
                except OSError:
                    pass
            raise

        # 10. Enqueue one Celery task per chunk
        chunk_ids = [str(doc["_id"]) for doc in chunk_docs]
        for chunk_id in chunk_ids:
            generate_document_chunk_embedding.apply_async(
                args=[chunk_id],
                queue=EMBEDDINGS_QUEUE,
            )

        return self._format_source(source_doc)

    # ------------------------------------------------------------------ list sources

    async def list_by_user(
        self, user_id: str, skip: int = 0, limit: int = 100
    ) -> list[SourceResponse]:
        coll = self._sources_collection
        cursor = (
            coll.find({"user_id": ObjectId(user_id)})
            .sort("ingested_at", -1)
            .skip(skip)
            .limit(limit)
        )
        return [self._format_source(doc) async for doc in cursor]

    async def list_by_topic(
        self, user_id: str, topic_id: str, skip: int = 0, limit: int = 100
    ) -> list[SourceResponse]:
        coll = self._sources_collection
        cursor = (
            coll.find({"user_id": ObjectId(user_id), "topic_id": ObjectId(topic_id)})
            .sort("ingested_at", -1)
            .skip(skip)
            .limit(limit)
        )
        return [self._format_source(doc) async for doc in cursor]

    # ------------------------------------------------------------------ get source

    async def get_source(self, source_id: str, user_id: str) -> SourceResponse:
        doc = await self._assert_source_owner(source_id, user_id)
        return self._format_source(doc)

    # ------------------------------------------------------------------ delete source (cascade)

    async def delete_source(self, source_id: str, user_id: str) -> None:
        await self._assert_source_owner(source_id, user_id)
        oid = ObjectId(source_id)
        await self._chunks_collection.delete_many({"source_id": oid})
        await self._sources_collection.delete_one({"_id": oid})

    # ------------------------------------------------------------------ list chunks

    async def get_chunks(
        self, source_id: str, user_id: str, skip: int = 0, limit: int = 200
    ) -> list[DocumentChunkResponse]:
        # Verify ownership first
        await self._assert_source_owner(source_id, user_id)
        coll = self._chunks_collection
        cursor = (
            coll.find({"source_id": ObjectId(source_id)})
            .sort("chunk_index", 1)
            .skip(skip)
            .limit(limit)
        )
        return [self._format_chunk(doc) async for doc in cursor]

    # ------------------------------------------------------------------ chunking progress

    async def get_progress(self, source_id: str, user_id: str) -> ChunkingProgressResponse:
        doc = await self._assert_source_owner(source_id, user_id)
        total = doc["total_chunks"]
        completed = await self._chunks_collection.count_documents(
            {"source_id": ObjectId(source_id), "embedding_status": "COMPLETED"}
        )
        return ChunkingProgressResponse(
            source_id=source_id,
            total_chunks=total,
            completed_chunks=completed,
            status=doc.get("chunking_status", "PENDING"),
        )
