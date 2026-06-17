import hashlib
from dataclasses import dataclass

from app.core.config import settings
from app.modules.documents.parser import PageResult


@dataclass
class Chunk:
    text: str
    start_char: int
    end_char: int
    page_number: int
    page_range: str
    chunk_hash: str
    tokens: int | None = None


def _count_tokens(text: str) -> int:
    """Rough token estimate (4 chars per token)."""
    return max(1, len(text) // 4)


def _compute_chunk_hash(text: str) -> str:
    """SHA-256 hex digest for idempotent re-ingestion."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def chunk_text(
    pages: list[PageResult],
    chunk_size: int | None = None,
    overlap: int | None = None,
) -> list[Chunk]:
    """Split extracted pages into fixed-size overlapping chunks.

    Args:
        pages: List of PageResult from the parser.
        chunk_size: Characters per chunk (default from settings).
        overlap: Overlap characters between adjacent chunks (default from settings).

    Returns:
        List of Chunk objects with hash, offsets, and page metadata.
    """
    chunk_size = chunk_size or settings.chunk_size
    overlap = overlap or settings.chunk_overlap
    stride = chunk_size - overlap

    if stride <= 0:
        raise ValueError("chunk_overlap must be less than chunk_size")

    # Build a flat text buffer tracking page ranges
    full_text = ""
    page_boundaries: list[tuple[int, int, int]] = []  # (start_char, end_char_exclusive, page_number)

    for page in pages:
        start = len(full_text)
        full_text += page.text + "\n"
        end = len(full_text)
        page_boundaries.append((start, end, page.page_number))

    if not full_text.strip():
        return []

    # Slice into overlapping chunks
    chunks: list[Chunk] = []
    pos = 0

    while pos < len(full_text):
        end = min(pos + chunk_size, len(full_text))
        text_segment = full_text[pos:end].strip()

        if text_segment:
            # Determine page range for this chunk
            chunk_start_page = 1
            chunk_end_page = 1
            for start_b, end_b, pn in page_boundaries:
                if start_b <= pos < end_b:
                    chunk_start_page = pn
                if start_b < end <= end_b:
                    chunk_end_page = pn
                elif end <= start_b:
                    break

            page_range = (
                str(chunk_start_page) if chunk_start_page == chunk_end_page
                else f"{chunk_start_page}-{chunk_end_page}"
            )

            chunks.append(Chunk(
                text=text_segment,
                start_char=pos,
                end_char=end,
                page_number=chunk_start_page,
                page_range=page_range,
                chunk_hash=_compute_chunk_hash(text_segment),
                tokens=_count_tokens(text_segment),
            ))

        pos += stride

    return chunks
