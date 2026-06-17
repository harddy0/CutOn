from dataclasses import dataclass

from pypdf import PdfReader


@dataclass
class PageResult:
    page_number: int
    text: str


def parse_pdf(file_path: str) -> list[PageResult]:
    """Extract text from a PDF file, returning one PageResult per page."""
    reader = PdfReader(file_path)
    pages: list[PageResult] = []

    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text()
        if text and text.strip():
            pages.append(PageResult(page_number=i, text=text.strip()))

    return pages


def parse_docx(file_path: str) -> list[PageResult]:
    """Extract text from a DOCX file using python-docx."""
    from docx import Document

    doc = Document(file_path)
    pages: list[PageResult] = []
    current_text: list[str] = []
    page_number = 1

    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            current_text.append(text)

    if current_text:
        pages.append(PageResult(page_number=1, text="\n".join(current_text)))

    return pages


def parse_txt(file_path: str) -> list[PageResult]:
    """Extract text from a plain text file (single page)."""
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read().strip()

    if text:
        return [PageResult(page_number=1, text=text)]
    return []


def parse_file(file_path: str, file_type: str) -> list[PageResult]:
    """Dispatch to the correct parser based on file type.

    Args:
        file_path: Path to the uploaded temp file.
        file_type: Lowercase extension (e.g. ``"pdf"``, ``"docx"``, ``"txt"``).

    Returns:
        A list of PageResult, one per page.
    """
    if file_type == "pdf":
        return parse_pdf(file_path)
    elif file_type == "docx":
        return parse_docx(file_path)
    elif file_type == "txt":
        return parse_txt(file_path)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")
