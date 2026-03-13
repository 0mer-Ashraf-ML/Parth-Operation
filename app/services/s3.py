"""
Amazon S3 service – upload, presigned URL, and delete.

All PDF documents uploaded by users are stored in S3.  The file key
is a UUID prefix + original filename to avoid collisions:
    e.g.  pdf_uploads/a1b2c3d4_CustomerPO-2026.pdf

Usage:
    from app.services.s3 import upload_file_to_s3, generate_presigned_url

    key, url = upload_file_to_s3(file_bytes, original_filename, content_type)
    presigned = generate_presigned_url(key)
"""

import uuid
from typing import BinaryIO

import boto3
from botocore.exceptions import ClientError

from app.config import settings
from app.exceptions import BadRequestException

# ── Allowed file types ──────────────────────────────────────
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
}
MAX_FILE_SIZE_MB = 25
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024  # 25 MB

# ── S3 client (module-level singleton) ──────────────────────
_s3_client = None


def _get_s3_client():
    """Lazy-initialise the S3 client so tests can mock it."""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY,
            aws_secret_access_key=settings.AWS_SECRET_KEY,
            region_name=settings.REGION,
        )
    return _s3_client


# ═══════════════════════════════════════════════════════════
#  UPLOAD
# ═══════════════════════════════════════════════════════════

def upload_file_to_s3(
    file_obj: BinaryIO,
    original_filename: str,
    content_type: str = "application/pdf",
) -> tuple[str, str]:
    """
    Upload a file to S3.

    Args:
        file_obj: File-like object (e.g. UploadFile.file)
        original_filename: Name the user gave the file
        content_type: MIME type

    Returns:
        (s3_key, s3_url) tuple – the key for future reference and
        the direct (private) S3 URL.

    Raises:
        BadRequestException if content type is not allowed or upload fails.
    """
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise BadRequestException(
            f"Only PDF files are allowed. Got: {content_type}"
        )

    # Sanitise filename and add UUID prefix
    safe_name = original_filename.replace(" ", "_")
    unique_key = f"pdf_uploads/{uuid.uuid4().hex[:8]}_{safe_name}"

    try:
        _get_s3_client().upload_fileobj(
            file_obj,
            settings.BUCKET_NAME,
            unique_key,
            ExtraArgs={
                "ContentType": content_type,
                "ContentDisposition": "inline",
            },
        )
    except ClientError as e:
        raise BadRequestException(f"S3 upload failed: {e}")

    s3_url = (
        f"https://{settings.BUCKET_NAME}.s3.{settings.REGION}"
        f".amazonaws.com/{unique_key}"
    )
    return unique_key, s3_url


# ═══════════════════════════════════════════════════════════
#  PRESIGNED URL  (valid for 1 hour by default)
# ═══════════════════════════════════════════════════════════

def generate_presigned_url(
    s3_key: str,
    expiration: int = 3600,
) -> str:
    """
    Generate a temporary presigned URL so the browser / frontend
    can display the PDF without permanent public access.

    Args:
        s3_key: The S3 object key (e.g. "pdf_uploads/abc123_file.pdf")
        expiration: Seconds until the URL expires (default 1 hour)

    Returns:
        A presigned URL string.
    """
    try:
        url = _get_s3_client().generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": settings.BUCKET_NAME,
                "Key": s3_key,
            },
            ExpiresIn=expiration,
        )
        return url
    except ClientError as e:
        raise BadRequestException(f"Failed to generate presigned URL: {e}")


# ═══════════════════════════════════════════════════════════
#  DOWNLOAD (get bytes – used by parser to send to Gemini)
# ═══════════════════════════════════════════════════════════

def download_file_from_s3(s3_key: str) -> bytes:
    """
    Download a file from S3 and return its raw bytes.
    Used by the PDF parser to send the file to Gemini.
    """
    try:
        response = _get_s3_client().get_object(
            Bucket=settings.BUCKET_NAME,
            Key=s3_key,
        )
        return response["Body"].read()
    except ClientError as e:
        raise BadRequestException(f"Failed to download file from S3: {e}")


# ═══════════════════════════════════════════════════════════
#  DELETE
# ═══════════════════════════════════════════════════════════

def delete_file_from_s3(s3_key: str) -> None:
    """Delete a file from S3 (e.g. when a Sales Order is deleted)."""
    try:
        _get_s3_client().delete_object(
            Bucket=settings.BUCKET_NAME,
            Key=s3_key,
        )
    except ClientError as e:
        # Non-critical – log but don't crash
        pass
