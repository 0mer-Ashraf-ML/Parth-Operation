"""
PDF Parser API routes.

Endpoints:
  POST /pdf/upload         – Upload PDF to S3 only (no parsing)
  POST /pdf/parse          – Upload PDF to S3 + parse with Gemini AI
  POST /pdf/parse-from-s3  – Parse an already-uploaded PDF from its S3 key

Permissions:
  • Admin and Account Manager can upload and parse PDFs.
  • Vendors cannot use these endpoints (they don't create SOs).
"""

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_admin_or_am
from app.exceptions import BadRequestException
from app.schemas.auth import CurrentUser
from app.schemas.pdf_parser import PDFUploadOut
from app.services import pdf_parser as parser_service
from app.services import s3 as s3_service

router = APIRouter(prefix="/pdf", tags=["PDF Parser"])


# ═══════════════════════════════════════════════════════════
#  1.  UPLOAD ONLY  (no AI parsing)
# ═══════════════════════════════════════════════════════════

@router.post(
    "/upload",
    status_code=status.HTTP_201_CREATED,
    summary="Upload a PDF to S3 (no parsing)",
)
def upload_pdf(
    file: UploadFile = File(..., description="PDF file to upload"),
    current_user: CurrentUser = Depends(require_admin_or_am),
):
    """
    Upload a customer PO PDF to Amazon S3.

    Returns the S3 key, private URL, and a presigned URL (valid ~1 hour)
    that can be used to view the PDF in the browser.

    The file is NOT parsed – use POST /pdf/parse for upload + parsing.
    """
    _validate_pdf_upload(file)

    s3_key, s3_url = s3_service.upload_file_to_s3(
        file_obj=file.file,
        original_filename=file.filename or "unknown.pdf",
        content_type=file.content_type or "application/pdf",
    )
    presigned_url = s3_service.generate_presigned_url(s3_key)

    return {
        "success": True,
        "data": PDFUploadOut(
            s3_key=s3_key,
            s3_url=s3_url,
            presigned_url=presigned_url,
            original_filename=file.filename or "unknown.pdf",
        ).model_dump(),
    }


# ═══════════════════════════════════════════════════════════
#  2.  UPLOAD + PARSE  (main endpoint)
# ═══════════════════════════════════════════════════════════

@router.post(
    "/parse",
    status_code=status.HTTP_200_OK,
    summary="Upload PDF to S3 and parse with Gemini AI",
)
def upload_and_parse_pdf(
    file: UploadFile = File(..., description="PDF file to upload and parse"),
    current_user: CurrentUser = Depends(require_admin_or_am),
    db: Session = Depends(get_db),
):
    """
    Upload a customer PO PDF to S3, then send it to **Gemini 2.5 Flash**
    for AI-powered extraction.

    **What happens:**
    1. PDF is uploaded to S3 (permanent storage).
    2. PDF bytes are sent to Gemini AI for structured extraction.
    3. Extracted SKU codes are matched against existing SKUs in the DB.
    4. Extracted customer name is matched against existing Clients.
    5. A structured "draft" Sales Order is returned.

    **The response can be used to pre-fill the SO creation form.**
    The Account Manager reviews the data, corrects any errors,
    then submits POST /sales-orders to create the actual SO.

    **Permissions:** Admin and Account Manager only.
    """
    _validate_pdf_upload(file)

    # Read file bytes for Gemini (before S3 upload consumes the stream)
    pdf_bytes = file.file.read()
    file.file.seek(0)  # Reset stream position for S3 upload

    # Upload to S3
    s3_key, s3_url = s3_service.upload_file_to_s3(
        file_obj=file.file,
        original_filename=file.filename or "unknown.pdf",
        content_type=file.content_type or "application/pdf",
    )
    presigned_url = s3_service.generate_presigned_url(s3_key)

    # Parse with Gemini
    parsed_data, raw_text = parser_service.parse_pdf_with_gemini(
        pdf_bytes=pdf_bytes,
        filename=file.filename or "unknown.pdf",
    )

    # Build structured result with DB matching
    result = parser_service.build_parse_result(
        db=db,
        parsed_data=parsed_data,
        raw_ai_text=raw_text,
        s3_key=s3_key,
        s3_url=s3_url,
        presigned_url=presigned_url,
        original_filename=file.filename or "unknown.pdf",
    )

    return {"success": True, "data": result.model_dump(mode="json")}


# ═══════════════════════════════════════════════════════════
#  3.  PARSE FROM EXISTING S3 KEY
# ═══════════════════════════════════════════════════════════

@router.post(
    "/parse-from-s3",
    status_code=status.HTTP_200_OK,
    summary="Parse an already-uploaded PDF from its S3 key",
)
def parse_from_s3(
    s3_key: str,
    current_user: CurrentUser = Depends(require_admin_or_am),
    db: Session = Depends(get_db),
):
    """
    Parse a PDF that was already uploaded to S3 (via POST /pdf/upload).

    Useful when:
    - The PDF was uploaded earlier but not parsed yet.
    - You want to re-parse a PDF with updated AI logic.
    - The initial parse failed and you want to retry.

    **Permissions:** Admin and Account Manager only.
    """
    # Download from S3
    pdf_bytes = s3_service.download_file_from_s3(s3_key)

    s3_url = (
        f"https://{s3_service.settings.BUCKET_NAME}.s3."
        f"{s3_service.settings.REGION}.amazonaws.com/{s3_key}"
    )
    presigned_url = s3_service.generate_presigned_url(s3_key)

    # Extract filename from key
    original_filename = s3_key.split("/")[-1] if "/" in s3_key else s3_key
    # Remove UUID prefix if present (format: abc12345_filename.pdf)
    if "_" in original_filename and len(original_filename.split("_")[0]) == 8:
        original_filename = "_".join(original_filename.split("_")[1:])

    # Parse with Gemini
    parsed_data, raw_text = parser_service.parse_pdf_with_gemini(
        pdf_bytes=pdf_bytes,
        filename=original_filename,
    )

    # Build structured result with DB matching
    result = parser_service.build_parse_result(
        db=db,
        parsed_data=parsed_data,
        raw_ai_text=raw_text,
        s3_key=s3_key,
        s3_url=s3_url,
        presigned_url=presigned_url,
        original_filename=original_filename,
    )

    return {"success": True, "data": result.model_dump(mode="json")}


# ═══════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════

def _validate_pdf_upload(file: UploadFile) -> None:
    """Common validation for PDF uploads."""
    if not file.filename:
        raise BadRequestException("File must have a filename.")

    # Check extension
    if not file.filename.lower().endswith(".pdf"):
        raise BadRequestException(
            f"Only PDF files are allowed. Got: {file.filename}"
        )

    # Check content type (some clients may not send it correctly)
    ct = (file.content_type or "").lower()
    if ct and ct not in ("application/pdf", "application/octet-stream"):
        raise BadRequestException(
            f"Invalid content type: {ct}. Expected application/pdf"
        )
