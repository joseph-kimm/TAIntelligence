import asyncio
import io
import logging
import time

import asyncpg
import tiktoken
from docx import Document as DocxDocument
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.schema import Document as LlamaDocument
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from pypdf import PdfReader
from core.config import settings
from db.chunks import bulk_insert_chunks_and_embeddings
from db.documents import update_document_token_count

logger = logging.getLogger(__name__)


def create_embed_model() -> HuggingFaceEmbedding:
    """Load the BGE embedding model. Called once at server startup."""
    return HuggingFaceEmbedding(
        model_name="BAAI/bge-small-en-v1.5",
        token=settings.hf_token
    )


def extract_text(file_bytes: bytes, mime_type: str) -> str:
    """Pull plain text out of PDF, DOCX, or TXT bytes."""
    if mime_type == "application/pdf":
        reader = PdfReader(io.BytesIO(file_bytes))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)

    if mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        doc = DocxDocument(io.BytesIO(file_bytes))
        return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())

    return file_bytes.decode("utf-8", errors="replace")


def chunk_text(text: str):
    """Split text into 350-token windows with 60-token overlap."""
    splitter = SentenceSplitter(chunk_size=350, chunk_overlap=60)
    return splitter.get_nodes_from_documents([LlamaDocument(text=text)])


def embed_chunks(embed_model: HuggingFaceEmbedding, texts: list[str]) -> list[list[float]]:
    """Return a 384-dim embedding vector for each text string."""
    return embed_model.get_text_embedding_batch(texts, show_progress=False)


async def ingest_document(
    pool: asyncpg.Pool,
    embed_model: HuggingFaceEmbedding,
    document_id: str,
    file_bytes: bytes,
    mime_type: str,
    title: str = "",
) -> None:
    """
    Full ingestion pipeline: extract → chunk → embed → store.
    Runs as a FastAPI BackgroundTask after the upload response is sent.
    """
    label = f'"{title}"' if title else document_id
    t_start = time.perf_counter()

    try:
        logger.info("[%s] Ingestion started (%.1f KB, %s)", label, len(file_bytes) / 1024, mime_type)

        t_extract = time.perf_counter()
        text = await asyncio.to_thread(extract_text, file_bytes, mime_type)
        if not text.strip():
            logger.warning("[%s] No extractable text — skipping", label)
            return

        char_count = len(text)
        word_count = len(text.split())
        token_count = len(tiktoken.get_encoding("cl100k_base").encode(text))
        logger.info("[%s] Extracted text in %.1fs — %d chars, ~%d words, %d tokens", label, time.perf_counter() - t_extract, char_count, word_count, token_count)

        t_chunk = time.perf_counter()
        nodes = await asyncio.to_thread(chunk_text, text)
        if not nodes:
            logger.warning("[%s] No chunks produced — skipping", label)
            return

        chunk_sizes = [len(n.get_content().split()) for n in nodes]
        logger.info(
            "[%s] Chunked in %.1fs — %d pieces, min=%d words, avg=%d words, max=%d words",
            label, time.perf_counter() - t_chunk, len(nodes), min(chunk_sizes), sum(chunk_sizes) // len(chunk_sizes), max(chunk_sizes),
        )

        texts = [node.get_content() for node in nodes]
        logger.info("[%s] Embedding %d chunks…", label, len(texts))
        t_embed = time.perf_counter()
        embeddings: list[list[float]] = await asyncio.to_thread(embed_chunks, embed_model, texts)
        logger.info("[%s] Embeddings done in %.1fs (dim=%d)", label, time.perf_counter() - t_embed, len(embeddings[0]) if embeddings else 0)

        t_db = time.perf_counter()
        chunks = [(idx, node.get_content()) for idx, node in enumerate(nodes)]
        count = await bulk_insert_chunks_and_embeddings(pool, document_id, chunks, embeddings)
        logger.info("[%s] DB write done in %.1fs — %d chunks stored", label, time.perf_counter() - t_db, count)

        await update_document_token_count(pool, document_id, token_count)

        logger.info("[%s] Ingestion complete in %.1fs total", label, time.perf_counter() - t_start)

    except Exception:
        logger.exception("[%s] Ingestion failed after %.1fs", label, time.perf_counter() - t_start)
