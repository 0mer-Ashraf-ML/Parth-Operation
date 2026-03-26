"""
Pydantic schemas for the PDF Parser (AI) module.

Three groups:
  1. Upload response  – returned after S3 upload
  2. Parsed line item – individual line extracted from the customer PO PDF
  3. Parsed result    – the full extraction (order-level + lines)

The parsed result is designed to map directly to SOCreate so the user
can review, edit, and then submit it to POST /sales-orders without
restructuring the data.
"""

import datetime as _dt
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════
#  S3 UPLOAD RESPONSE
# ═══════════════════════════════════════════════════════════

class PDFUploadOut(BaseModel):
    """Returned after a successful upload to S3."""
    s3_key: str = Field(..., description="S3 object key for internal reference")
    s3_url: str = Field(..., description="Private S3 URL (not directly accessible)")
    presigned_url: str = Field(..., description="Temporary public URL (valid ~1 hour)")
    original_filename: str


# ═══════════════════════════════════════════════════════════
#  PARSED LINE ITEM  (one row from the PDF table)
# ═══════════════════════════════════════════════════════════

class ParsedLineItem(BaseModel):
    """
    A single line item extracted from the customer's Purchase Order PDF.

    Fields mirror what typically appears on a PO table row.
    The user will match sku_code / sku_description to existing SKUs
    in the system before finalising the Sales Order.
    """
    line_number: int = Field(
        ..., ge=1,
        description="Row position in the PO table (1-based)",
    )
    sku_code: Optional[str] = Field(
        None,
        description="Product / item code from the PDF (e.g. '7290-BLK-XL')",
    )
    sku_description: Optional[str] = Field(
        None,
        description="Product description as written on the PDF",
    )
    quantity: int = Field(
        ..., ge=1,
        description="Number of units ordered on this line",
    )
    unit_price: Optional[Decimal] = Field(
        None, ge=0,
        description="Price per unit from the PDF (may be absent)",
    )
    total_price: Optional[Decimal] = Field(
        None, ge=0,
        description="Line total (qty * unit_price) from the PDF",
    )
    due_date: Optional[_dt.date] = Field(
        None,
        description="Per-line due / delivery date if mentioned",
    )
    notes: Optional[str] = Field(
        None,
        description="Any extra notes or special instructions for this line",
    )

    # ── SKU matching (filled by our service if a match is found) ──
    matched_sku_id: Optional[int] = Field(
        None,
        description="If the extracted sku_code matches an existing SKU, its ID is placed here",
    )
    matched_sku_name: Optional[str] = Field(
        None,
        description="Name of the matched SKU from the database",
    )
    match_confidence: Optional[str] = Field(
        None,
        description="How confident the match is: exact, partial, or none",
    )


# ═══════════════════════════════════════════════════════════
#  PARSED SHIP-TO ADDRESS
# ═══════════════════════════════════════════════════════════

class ParsedAddress(BaseModel):
    """Ship-to address extracted from the PDF."""
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = Field(None, description="Defaults to US if not mentioned")


# ═══════════════════════════════════════════════════════════
#  FULL PARSE RESULT
# ═══════════════════════════════════════════════════════════

class PDFParseResult(BaseModel):
    """
    Complete extraction from a customer PO PDF.

    This is the "draft" Sales Order that the Account Manager
    reviews in the UI before hitting "Create SO".

    The structure is deliberately close to SOCreate so that the
    frontend can pre-fill the SO creation form from this response.
    """

    # ── PDF metadata ───────────────────────────────────────
    s3_key: str = Field(..., description="S3 object key of the uploaded PDF")
    s3_url: str = Field(..., description="Private S3 URL")
    presigned_url: str = Field(..., description="Temporary viewable URL")
    original_filename: str

    # ── Order-level data extracted from PDF ─────────────────
    order_number: Optional[str] = Field(
        None,
        description="PO number from the customer's document",
    )
    order_date: Optional[_dt.date] = Field(
        None,
        description="Date on the customer's PO",
    )
    due_date: Optional[_dt.date] = Field(
        None,
        description="Overall delivery due date from the PO",
    )

    # ── Customer / Buyer info ──────────────────────────────
    customer_name: Optional[str] = Field(
        None,
        description="Company name of the buyer on the PO",
    )
    customer_contact: Optional[str] = Field(
        None,
        description="Contact person name on the PO",
    )
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None

    # ── Ship-to address ────────────────────────────────────
    ship_to_address: Optional[ParsedAddress] = None

    # ── Bill-to address ────────────────────────────────────
    bill_to_address: Optional[ParsedAddress] = None

    # ── Financial summary ──────────────────────────────────
    subtotal: Optional[Decimal] = Field(None, description="Subtotal from PDF")
    tax_amount: Optional[Decimal] = Field(None, description="Tax amount from PDF")
    total_amount: Optional[Decimal] = Field(None, description="Grand total from PDF")
    currency: Optional[str] = Field("USD", description="Currency code")
    payment_terms: Optional[str] = Field(
        None,
        description="Payment terms text from PDF (e.g. 'Net 30')",
    )

    # ── Line items ─────────────────────────────────────────
    line_items: list[ParsedLineItem] = Field(
        default=[],
        description="All extracted line items from the PO table",
    )

    # ── Client matching ────────────────────────────────────
    matched_client_id: Optional[int] = Field(
        None,
        description="If customer_name matches an existing Client, its ID",
    )
    matched_client_name: Optional[str] = None

    # ── Auto-created ship-to address on matched client ─────
    ship_to_address_id: Optional[int] = Field(
        None,
        description=(
            "If a client was matched AND a valid ship-to address was extracted, "
            "the system auto-creates (or reuses) a ClientAddress and returns its ID here. "
            "This can be passed directly to SOCreate.ship_to_address_id."
        ),
    )
    billing_address_id: Optional[int] = Field(
        None,
        description=(
            "If a client was matched AND a valid bill-to address was extracted, "
            "a BILLING ClientAddress is created or reused; ID returned here. "
            "If the client had no billing_address_id set, it is pointed at this row."
        ),
    )

    # ── Raw AI output (for debugging / transparency) ───────
    raw_ai_response: Optional[str] = Field(
        None,
        description="The raw JSON string returned by Gemini (for debugging)",
    )

    # ── Confidence & notes ─────────────────────────────────
    parsing_notes: Optional[str] = Field(
        None,
        description="Any warnings or notes from the AI about the extraction",
    )
    confidence_score: Optional[str] = Field(
        None,
        description="Overall confidence: high, medium, low",
    )
