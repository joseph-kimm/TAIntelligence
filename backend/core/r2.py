import boto3

from core.config import settings


def _client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )


def upload_to_r2(file_bytes: bytes, key: str, content_type: str) -> str:
    """Upload bytes to R2 and return the storage key."""
    _client().put_object(
        Bucket=settings.r2_bucket_name,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
    )
    return key


def delete_from_r2(key: str) -> None:
    """Delete an object from R2 by its storage key."""
    _client().delete_object(Bucket=settings.r2_bucket_name, Key=key)
