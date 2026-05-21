import modal

app = modal.App("tai-backend")


def _download_models():
    """
    Pre-download models into the image layer at build time.
    Cold starts restore from the memory snapshot instead of re-fetching.
    bge-small-en-v1.5 is public — no HF token needed at build time.
    """
    import tiktoken
    from llama_index.embeddings.huggingface import HuggingFaceEmbedding

    HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")
    tiktoken.get_encoding("cl100k_base")


image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_pyproject("pyproject.toml")
    .run_function(_download_models)
    .env({"PYTHONPATH": "/app"})
    .add_local_dir(
        ".",
        remote_path="/app",
        ignore=[".env", "*.env", "__pycache__", "*.pyc", ".venv", "*.egg-info", "script"],
    )
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("tai-secrets")],
    cpu=2,
    memory=4096,
    timeout=600,
    max_containers=1,
    allow_concurrent_inputs=10,
    enable_memory_snapshot=True,
)
@modal.asgi_app()
def fastapi_app():
    from main import app  # imported inside function so Modal serializes only what's needed

    return app
