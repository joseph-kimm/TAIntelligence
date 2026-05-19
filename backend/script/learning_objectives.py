import asyncio
import os
import asyncpg
from dotenv import load_dotenv
from openai import AsyncOpenAI
import math

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]
OPENROUTER_KEY = os.environ["OPENROUTER_KEY"]
OPENROUTER_MODEL = os.environ["OPENROUTER_MODEL"]
CONTEXT_LIMIT = os.environ["MODEL_CONTEXT_LIMIT"]


SYSTEM_PROMPT = """\
You are an expert instructional designer. Given the full text of a course document, \
produce a list of concise learning objectives that a student should be able to achieve \
after studying the material.

Format your response as a list, one objective per line. Each objective should:
- Start with an action verb (e.g. Explain, Apply, Analyze, Evaluate)
- Be specific and measurable
- Be relevant to the document content

Return only a list, no preamble or closing remarks.\
"""


async def get_documents() -> list[dict]:

    print("getting all available documents")

    pool = await asyncpg.create_pool(DATABASE_URL)

    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, title, full_text, token_count
            FROM documents
            ORDER BY created_at DESC
        """)

    await pool.close()
    return [dict(row) for row in rows]

def split_into_chunks(text, batch):
    chunk_size = len(text) // batch

    chunks = []

    for i in range(batch):
        start = i * chunk_size

        # last chunk gets remainder
        if i == batch - 1:
            end = len(text)
        else:
            end = (i + 1) * chunk_size

        chunks.append(text[start:end])

    return chunks


async def generate_learning_objectives(doc) -> str:

    size = int(doc['token_count'])
    limit = 0.8 * int(CONTEXT_LIMIT)

    batch_size = math.ceil(size / limit)

    print(f"generating learning objects by {batch_size} batches")

    text_chunks = split_into_chunks(doc['full_text'], batch_size)
        
    client = AsyncOpenAI(
        api_key=OPENROUTER_KEY,
        base_url="https://openrouter.ai/api/v1",
    )

    responses = []
    for i, text in enumerate(text_chunks):

        print(f"obtaining learning objective from {i+1} batch")
        response = await client.chat.completions.create(
            model=OPENROUTER_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Document text:\n\n{text}"},
            ],
            stream=False,
            temperature=0.4,
        )

        responses.append(response.choices[0].message.content)

    response = "\n".join(responses)
    return response

async def main() -> None:

    documents = await get_documents()
    for i, doc in enumerate(documents):
        print(f"{i}) {doc['title']} : {doc['id']}")
    
    index = int(input('Enter the index of the document to generate learning objectives: '))
    
    objectives = await generate_learning_objectives(documents[index])

    print(objectives)
    

if __name__ == "__main__":
    asyncio.run(main())
