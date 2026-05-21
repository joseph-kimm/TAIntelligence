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


def delete_from_r2(key: str) -> None:
    """Delete an object from R2 by its storage key."""
    _client().delete_object(Bucket=settings.r2_bucket_name, Key=key)


def generate_presigned_put_url(key: str, content_type: str, expires_in: int = 900) -> str:
    """Generate a presigned PUT URL for direct browser → R2 upload (15-min default expiry).

    ContentType is part of the signature — R2 rejects PUTs with a mismatched Content-Type header.
    """
    return _client().generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.r2_bucket_name, "Key": key, "ContentType": content_type},
        ExpiresIn=expires_in,
        HttpMethod="PUT",
    )


def fetch_from_r2(key: str) -> tuple[bytes, str]:
    """Fetch an object from R2. Returns (file_bytes, content_type)."""
    obj = _client().get_object(Bucket=settings.r2_bucket_name, Key=key)
    return obj["Body"].read(), obj["ContentType"]
