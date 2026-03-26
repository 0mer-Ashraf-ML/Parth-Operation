"""
PDF Parser service – uses Google Gemini 2.5 Flash to extract
structured Sales Order data from customer Purchase Order PDFs.

Flow:
  1. Receive raw PDF bytes (from S3 or direct upload).
  2. Send to Gemini 2.5 Flash with a detailed extraction prompt.
  3. Parse the AI's JSON response into our Pydantic schema.
  4. Attempt to match extracted SKU codes / customer name to
     existing records in the database.
  5. Return a structured "draft" that maps to SOCreate.

The prompt is carefully engineered to:
  • Handle various PO formats (different layouts, headers, tables).
  • Return a strict JSON schema that maps to our data model.
  • Extract per-line due dates, quantities, unit prices.
  • Identify ship-to / bill-to addresses.
  • Provide confidence scores for the extraction.
"""

import json
import logging
import re
from decimal import Decimal, InvalidOperation
from typing import Optional

import google.generativeai as genai
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.exceptions import BadRequestException
from app.models.client import Client, ClientAddress
from app.models.enums import AddressType
from app.models.sku import SKU
from app.schemas.pdf_parser import (
    ParsedAddress,
    ParsedLineItem,
    PDFParseResult,
)

logger = logging.getLogger(__name__)

_CUSTOMER_EMAIL_RE = re.compile(
    r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}",
    re.IGNORECASE,
)


def _normalize_customer_contact_fields(
    contact: Optional[str],
    email: Optional[str],
) -> tuple[Optional[str], Optional[str]]:
    """
    Ensure emails land in customer_email, not embedded in customer_contact
    (e.g. 'Jane Doe <jane@acme.com>' or 'jane@acme.com').
    """
    c = (contact or "").strip() or None
    e = (email or "").strip() or None

    if c:
        m = _CUSTOMER_EMAIL_RE.search(c)
        if m:
            found = m.group(0)
            if not e:
                e = found
            remainder = _CUSTOMER_EMAIL_RE.sub("", c)
            remainder = remainder.strip(" \t\n\r,;|<>()[]")
            remainder = re.sub(r"\s+", " ", remainder).strip()
            c = remainder or None

    if e:
        m2 = _CUSTOMER_EMAIL_RE.search(e)
        e = m2.group(0).strip() if m2 else None

    return c, e


# ── Configure Gemini ──────────────────────────────────────
_model = None


def _get_gemini_model():
    """Lazy-initialise the Gemini model."""
    global _model
    if _model is None:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        _model = genai.GenerativeModel("gemini-2.5-flash")
    return _model


# ═══════════════════════════════════════════════════════════
#  EXTRACTION PROMPT
# ═══════════════════════════════════════════════════════════

_EXTRACTION_PROMPT = """
You are a document extraction AI. You are given a customer Purchase Order (PO) PDF document.
Your task is to extract ALL structured data from this document and return it as a JSON object.

IMPORTANT RULES:
1. Extract EVERY field you can find. If a field is not present in the document, use null.
2. For dates, use ISO format: YYYY-MM-DD
3. For monetary values, use numbers without currency symbols (e.g., 3.51 not $3.51)
4. For quantities, use integers.
5. The line_items array MUST contain every row from the product/items table.
6. Line numbers should be 1-based (first item = 1, second = 2, etc.)
7. If the document contains a "Ship To" or "Deliver To" address, extract it into ship_to_address.
8. If the document contains a "Bill To" or "Invoice To" address, extract it into bill_to_address.
9. Payment terms might appear as "Net 30", "Net 45", "Due on Receipt", etc.
10. The customer's PO number is OUR sales order number - extract it carefully.
11. CRITICAL: SKU codes / part numbers / item codes must NEVER contain internal spaces or line breaks.
    PDF table columns are often narrow, causing text to wrap to a new line mid-value.
    You MUST rejoin any wrapped text into one continuous string.
    Example: if a cell shows "PO-SKU-A1-21002" on one line and "1" on the next, the sku_code is "PO-SKU-A1-210021" (no space).
    Similarly "FUL-SKU-V2-2200" + "48" = "FUL-SKU-V2-220048".
    The same rule applies to the order_number field — remove any accidental internal spaces or line breaks.
12. Ensure the JSON is COMPLETE and properly closed. Do not truncate output.
13. Do not stop mid-object. Always close all brackets and arrays.

Return ONLY a valid JSON object with this EXACT structure (no markdown, no code fences, no explanation):

{
  "order_number": "string or null - the PO number / order number from the document",
  "order_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null - overall delivery/due date",
  "customer_name": "string or null - the buyer/customer company name",
  "customer_contact": "string or null - contact person name ONLY (no email here)",
  "customer_email": "string or null - email only; never duplicate inside customer_contact",
  "customer_phone": "string or null",
  "ship_to_address": {
    "address_line_1": "string or null",
    "address_line_2": "string or null",
    "city": "string or null",
    "state": "string or null",
    "zip_code": "string or null",
    "country": "string or null"
  },
  "bill_to_address": {
    "address_line_1": "string or null",
    "address_line_2": "string or null",
    "city": "string or null",
    "state": "string or null",
    "zip_code": "string or null",
    "country": "string or null"
  },
  "subtotal": number or null,
  "tax_amount": number or null,
  "total_amount": number or null,
  "currency": "string, default USD",
  "payment_terms": "string or null - e.g. Net 30",
  "line_items": [
    {
      "line_number": 1,
      "sku_code": "string or null - product/item code or part number",
      "sku_description": "string or null - product description/name",
      "quantity": integer,
      "unit_price": number or null,
      "total_price": number or null,
      "due_date": "YYYY-MM-DD or null - per-line delivery date if different",
      "notes": "string or null - any special instructions for this line"
    }
  ],
  "parsing_notes": "string - any warnings, ambiguities, or notes about the extraction",
  "confidence_score": "high, medium, or low - your overall confidence in the extraction accuracy"
}
"""


# ═══════════════════════════════════════════════════════════
#  CORE PARSE FUNCTION
# ═══════════════════════════════════════════════════════════

def parse_pdf_with_gemini(pdf_bytes: bytes, filename: str) -> dict:
    """
    Send PDF bytes to Gemini 2.5 Flash and get structured extraction.

    Args:
        pdf_bytes: Raw bytes of the PDF file.
        filename: Original filename (for context).

    Returns:
        Parsed JSON dict from Gemini.

    Raises:
        BadRequestException if Gemini fails or returns unparseable output.
    """
    model = _get_gemini_model()

    # Gemini supports direct PDF upload via inline_data
    pdf_part = {
        "inline_data": {
            "mime_type": "application/pdf",
            "data": pdf_bytes,
        }
    }

    try:
        response = model.generate_content(
            [
                pdf_part,
                _EXTRACTION_PROMPT,
            ],
            generation_config=genai.GenerationConfig(
                temperature=0.1,  # Low temperature for consistent extraction
            ),
        )
    except Exception as e:
        logger.error(f"Gemini API call failed for {filename}: {e}")
        raise BadRequestException(f"AI parsing failed: {str(e)}")

    # Extract text from response
    raw_text = response.text.strip()

    # Clean up: Gemini sometimes wraps JSON in markdown code fences
    if raw_text.startswith("```"):
        # Remove ```json ... ``` or ``` ... ```
        lines = raw_text.split("\n")
        # Find first and last ``` lines
        start = 0
        end = len(lines) - 1
        for i, line in enumerate(lines):
            if line.strip().startswith("```"):
                start = i + 1
                break
        for i in range(len(lines) - 1, -1, -1):
            if lines[i].strip() == "```":
                end = i
                break
        raw_text = "\n".join(lines[start:end])

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini response as JSON: {e}\nRaw: {raw_text[:500]}")
        raise BadRequestException(
            f"AI returned invalid JSON. Please try again or upload a clearer PDF. "
            f"Parse error: {str(e)}"
        )

    return parsed, raw_text


# ═══════════════════════════════════════════════════════════
#  SKU MATCHING
# ═══════════════════════════════════════════════════════════

def _match_skus(
    db: Session,
    line_items: list[dict],
) -> list[dict]:
    """
    Attempt to match extracted SKU codes to existing SKUs in the database.

    Matching strategy:
      1. Exact match on sku_code (case-insensitive).
      2. Partial match: check if extracted code is contained in any sku_code.
      3. No match: leave matched_sku_id as None.
    """
    if not line_items:
        return line_items

    # Load all active SKUs for matching
    skus = db.execute(
        select(SKU).where(SKU.is_active.is_(True))
    ).scalars().all()

    sku_lookup_exact: dict[str, SKU] = {}
    sku_list: list[SKU] = []
    for sku in skus:
        sku_lookup_exact[sku.sku_code.lower()] = sku
        sku_list.append(sku)

    for item in line_items:
        code = _normalize_code(item.get("sku_code") or "").lower()
        if not code:
            item["matched_sku_id"] = None
            item["matched_sku_name"] = None
            item["match_confidence"] = "none"
            continue

        # Try exact match
        if code in sku_lookup_exact:
            matched = sku_lookup_exact[code]
            item["matched_sku_id"] = matched.id
            item["matched_sku_name"] = matched.name
            item["match_confidence"] = "exact"
            continue

        # Try partial match (code contained in sku_code or vice versa)
        partial_match = None
        for sku in sku_list:
            sku_lower = sku.sku_code.lower()
            if code in sku_lower or sku_lower in code:
                partial_match = sku
                break

        if partial_match:
            item["matched_sku_id"] = partial_match.id
            item["matched_sku_name"] = partial_match.name
            item["match_confidence"] = "partial"
        else:
            item["matched_sku_id"] = None
            item["matched_sku_name"] = None
            item["match_confidence"] = "none"

    return line_items


# ═══════════════════════════════════════════════════════════
#  CLIENT MATCHING
# ═══════════════════════════════════════════════════════════

def _match_client(
    db: Session,
    customer_name: Optional[str],
) -> tuple[Optional[int], Optional[str]]:
    """
    Attempt to match the extracted customer name to an existing Client.

    Strategy:
      1. Exact match on company_name (case-insensitive).
      2. Partial match: customer_name contained in company_name.
      3. No match: return None.
    """
    if not customer_name:
        return None, None

    name_lower = customer_name.strip().lower()

    # Exact match (case-insensitive); if duplicates exist, pick lowest id
    client = db.scalars(
        select(Client)
        .where(
            Client.is_active.is_(True),
            Client.company_name.ilike(name_lower),
        )
        .order_by(Client.id.asc())
        .limit(1)
    ).first()

    if client:
        return client.id, client.company_name

    # Partial match – customer name contained in company name
    clients = db.execute(
        select(Client).where(Client.is_active.is_(True))
    ).scalars().all()

    for c in clients:
        if name_lower in c.company_name.lower() or c.company_name.lower() in name_lower:
            return c.id, c.company_name

    return None, None


# ═══════════════════════════════════════════════════════════
#  SAFE TYPE CONVERTERS
# ═══════════════════════════════════════════════════════════

def _normalize_code(val: Optional[str]) -> Optional[str]:
    """
    Remove accidental internal whitespace / line-breaks from SKU codes
    and order numbers.  PDF table columns are narrow, so Gemini sometimes
    inserts spaces when text wraps inside a cell.

    Examples:
        "PO-SKU-A1-21002 1" → "PO-SKU-A1-210021"
        "FUL-SKU-V2-2200 48" → "FUL-SKU-V2-220048"
        "TEST-SKU-SEC-00 0"  → "TEST-SKU-SEC-000"
        "80-203099-A"        → "80-203099-A"  (unchanged)
    """
    if not val:
        return val
    # Collapse ALL inner whitespace (spaces, newlines, tabs)
    return "".join(val.split())


def _safe_decimal(val) -> Optional[Decimal]:
    """Convert a value to Decimal, return None on failure."""
    if val is None:
        return None
    try:
        return Decimal(str(val))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _safe_date(val) -> Optional[str]:
    """Validate an ISO date string, return None if invalid."""
    if val is None:
        return None
    try:
        from datetime import date as _d
        _d.fromisoformat(str(val))
        return str(val)
    except (ValueError, TypeError):
        return None


def _safe_int(val, default: int = 0) -> int:
    """Convert to int, return default on failure."""
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


# ═══════════════════════════════════════════════════════════
#  BUILD FULL PARSE RESULT
# ═══════════════════════════════════════════════════════════

def build_parse_result(
    db: Session,
    parsed_data: dict,
    raw_ai_text: str,
    s3_key: str,
    s3_url: str,
    presigned_url: str,
    original_filename: str,
) -> PDFParseResult:
    """
    Take the raw Gemini output and build a fully structured
    PDFParseResult with SKU and client matching.
    """

    # ── Parse line items ───────────────────────────────────
    raw_lines = parsed_data.get("line_items", [])
    line_items = []
    for i, item in enumerate(raw_lines):
        qty = _safe_int(item.get("quantity"), 1)
        if qty < 1:
            qty = 1

        line_items.append({
            "line_number": item.get("line_number", i + 1),
            "sku_code": _normalize_code(item.get("sku_code")),
            "sku_description": item.get("sku_description"),
            "quantity": qty,
            "unit_price": _safe_decimal(item.get("unit_price")),
            "total_price": _safe_decimal(item.get("total_price")),
            "due_date": _safe_date(item.get("due_date")),
            "notes": item.get("notes"),
        })

    # ── Match SKUs ─────────────────────────────────────────
    line_items = _match_skus(db, line_items)

    # ── Match client ───────────────────────────────────────
    customer_name = parsed_data.get("customer_name")
    matched_client_id, matched_client_name = _match_client(db, customer_name)

    cust_contact, cust_email = _normalize_customer_contact_fields(
        parsed_data.get("customer_contact"),
        parsed_data.get("customer_email"),
    )

    # ── Parse addresses ────────────────────────────────────
    ship_to_raw = parsed_data.get("ship_to_address") or {}
    ship_to = ParsedAddress(**{
        k: ship_to_raw.get(k) for k in
        ["address_line_1", "address_line_2", "city", "state", "zip_code", "country"]
    }) if any(ship_to_raw.values()) else None

    bill_to_raw = parsed_data.get("bill_to_address") or {}
    bill_to = ParsedAddress(**{
        k: bill_to_raw.get(k) for k in
        ["address_line_1", "address_line_2", "city", "state", "zip_code", "country"]
    }) if any(bill_to_raw.values()) else None

    # ── Auto-create ship-to address on matched client ───────
    ship_to_address_id: Optional[int] = None
    if matched_client_id and ship_to:
        ship_to_address_id = _auto_create_ship_to_address(
            db, matched_client_id, ship_to, original_filename,
        )

    # ── Build final result ─────────────────────────────────
    parsed_line_items = []
    for item in line_items:
        parsed_line_items.append(ParsedLineItem(
            line_number=item["line_number"],
            sku_code=item.get("sku_code"),
            sku_description=item.get("sku_description"),
            quantity=item["quantity"],
            unit_price=item.get("unit_price"),
            total_price=item.get("total_price"),
            due_date=item.get("due_date"),
            notes=item.get("notes"),
            matched_sku_id=item.get("matched_sku_id"),
            matched_sku_name=item.get("matched_sku_name"),
            match_confidence=item.get("match_confidence"),
        ))

    return PDFParseResult(
        s3_key=s3_key,
        s3_url=s3_url,
        presigned_url=presigned_url,
        original_filename=original_filename,
        order_number=_normalize_code(parsed_data.get("order_number")),
        order_date=_safe_date(parsed_data.get("order_date")),
        due_date=_safe_date(parsed_data.get("due_date")),
        customer_name=customer_name,
        customer_contact=cust_contact,
        customer_email=cust_email,
        customer_phone=parsed_data.get("customer_phone"),
        ship_to_address=ship_to,
        bill_to_address=bill_to,
        subtotal=_safe_decimal(parsed_data.get("subtotal")),
        tax_amount=_safe_decimal(parsed_data.get("tax_amount")),
        total_amount=_safe_decimal(parsed_data.get("total_amount")),
        currency=parsed_data.get("currency", "USD"),
        payment_terms=parsed_data.get("payment_terms"),
        line_items=parsed_line_items,
        matched_client_id=matched_client_id,
        matched_client_name=matched_client_name,
        ship_to_address_id=ship_to_address_id,
        raw_ai_response=raw_ai_text,
        parsing_notes=parsed_data.get("parsing_notes"),
        confidence_score=parsed_data.get("confidence_score"),
    )


# ═══════════════════════════════════════════════════════════
#  AUTO-CREATE SHIP-TO ADDRESS ON CLIENT
# ═══════════════════════════════════════════════════════════

def _auto_create_ship_to_address(
    db: Session,
    client_id: int,
    ship_to: ParsedAddress,
    source_filename: str,
) -> Optional[int]:
    """
    If the extracted ship-to address has at least address_line_1 and city,
    look for an existing address on the client that matches.

    • If found  → return existing address ID (no duplicate).
    • If not    → create a new ClientAddress with address_type=SHIP_TO
                  and return its ID.
    • If data is too sparse → return None.
    """
    # Need at minimum address_line_1 and city to create
    if not ship_to.address_line_1 or not ship_to.city:
        logger.info("Ship-to address too sparse to auto-create – skipping")
        return None

    # Check for existing address with same line1 + city on this client.
    # Duplicates are possible (re-imports, manual data); pick one deterministically.
    existing = db.scalars(
        select(ClientAddress)
        .where(
            ClientAddress.client_id == client_id,
            ClientAddress.address_line_1.ilike(ship_to.address_line_1.strip()),
            ClientAddress.city.ilike(ship_to.city.strip()),
        )
        .order_by(ClientAddress.id.asc())
        .limit(1)
    ).first()

    if existing:
        logger.info(
            f"Reusing existing client address id={existing.id} for client {client_id}"
        )
        return existing.id

    # Create new address
    new_addr = ClientAddress(
        client_id=client_id,
        address_type=AddressType.SHIP_TO,
        label=f"Ship To (from {source_filename})",
        address_line_1=ship_to.address_line_1.strip(),
        address_line_2=(ship_to.address_line_2 or "").strip() or None,
        city=ship_to.city.strip(),
        state=(ship_to.state or "").strip() or "N/A",
        zip_code=(ship_to.zip_code or "").strip() or "N/A",
        country=(ship_to.country or "US").strip(),
        is_default=False,
    )
    db.add(new_addr)
    db.flush()  # Get the ID without committing (caller's transaction)

    logger.info(
        f"Auto-created ship-to address id={new_addr.id} on client {client_id} "
        f"from PDF '{source_filename}'"
    )
    return new_addr.id
