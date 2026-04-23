import asyncio
import io
import logging

import asyncpg
from docx import Document as DocxDocument
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.schema import Document as LlamaDocument
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from pypdf import PdfReader
from core.config import settings

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
) -> None:
    """
    Full ingestion pipeline: extract → chunk → embed → store.
    Runs as a FastAPI BackgroundTask after the upload response is sent.
    """
    from db.chunks import delete_chunks_by_document, insert_chunk, insert_embedding

    try:
        logger.info("Ingestion started for document %s", document_id)

        text = extract_text(file_bytes, mime_type)
        if not text.strip():
            logger.warning("Document %s produced no extractable text — skipping", document_id)
            return

        nodes = chunk_text(text)
        if not nodes:
            logger.warning("Document %s produced no chunks — skipping", document_id)
            return

        # embed_chunks is synchronous CPU work — run in a thread to avoid blocking the event loop
        texts = [node.get_content() for node in nodes]
        embeddings: list[list[float]] = await asyncio.to_thread(embed_chunks, embed_model, texts)

        # Clear any previous ingestion so re-uploads don't accumulate duplicate chunks
        await delete_chunks_by_document(pool, document_id)

        for idx, (node, embedding) in enumerate(zip(nodes, embeddings)):
            chunk_id = await insert_chunk(
                pool,
                document_id=document_id,
                chunk_index=idx,
                text=node.get_content(),
            )
            await insert_embedding(pool, chunk_id=chunk_id, embedding=embedding)

        logger.info("Ingestion complete for document %s — %d chunks stored", document_id, len(nodes))

    except Exception:
        logger.exception("Ingestion failed for document %s", document_id)
