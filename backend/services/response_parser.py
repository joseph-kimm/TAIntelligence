from __future__ import annotations

import logging
import re

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ChunkCitation(BaseModel):
    id: str
    text: str
    document_title: str


class ParsedResponse(BaseModel):
    content: str
    cited_chunks: list[ChunkCitation]


def parse_and_validate(raw: str, chunks: list[dict]) -> ParsedResponse:
    """Map positional chunk IDs to real UUIDs, strip invalid citations."""
    index_map = {f"chunk_{i}": chunk for i, chunk in enumerate(chunks, 1)}
    cited_by_id: dict[str, ChunkCitation] = {}

    stripped_count = 0

    def replace_citation(match: re.Match) -> str:
        nonlocal stripped_count
        parts = [p.strip() for p in match.group(1).split(",")]
        valid_uuids: list[str] = []
        for part in parts:
            chunk = index_map.get(part)
            if chunk:
                uuid = chunk["id"]
                valid_uuids.append(uuid)
                if uuid not in cited_by_id:
                    cited_by_id[uuid] = ChunkCitation(
                        id=uuid,
                        text=chunk["text"],
                        document_title=chunk["document_title"],
                    )
            else:
                logger.warning("Stripping invalid citation '%s' (not in retrieved chunks)", part)
                stripped_count += 1
        return "<<" + ",".join(valid_uuids) + ">>" if valid_uuids else ""

    cleaned = re.sub(r"<<(chunk_\d+(?:\s*,\s*chunk_\d+)*)>>", replace_citation, raw)
    cleaned = re.sub(r"  +", " ", cleaned).strip()

    valid_count = len(cited_by_id)
    total_count = valid_count + stripped_count
    logger.info(
        "Citation parsing complete — total=%d valid=%d stripped=%d unique_chunks_cited=%d",
        total_count, valid_count, stripped_count, len(cited_by_id),
    )
    for i, c in enumerate(cited_by_id.values(), 1):
        logger.info("  [cited %d] chunk_id=%s doc='%s'", i, c.id, c.document_title)
    if stripped_count:
        logger.warning("  %d citation(s) stripped (hallucinated IDs not in retrieved set)", stripped_count)

    return ParsedResponse(content=cleaned, cited_chunks=list(cited_by_id.values()))
