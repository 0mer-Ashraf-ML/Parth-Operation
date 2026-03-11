"""
Pydantic schemas for Sales Order and SO Line endpoints.

Naming convention:
  • *Create  – POST request body
  • *Update  – PATCH request body (all fields optional)
  • *Out     – response body (what the API returns)
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import SOStatus


# ═══════════════════════════════════════════════════════════
#  SO LINE
# ═══════════════════════════════════════════════════════════

class SOLineCreate(BaseModel):
    """One line item within a Sales Order."""
    sku_id: int
    line_number: Optional[int] = Field(
        None, ge=1,
        description="Position within the SO (auto-assigned if omitted)",
    )
    ordered_qty: int = Field(..., ge=1, examples=[100])
    unit_price: Optional[Decimal] = Field(
        None, ge=0, decimal_places=2,
        description="Leave blank to auto-resolve from tier pricing",
        examples=[Decimal("3.51")],
    )
    due_date: Optional[date] = Field(
        None,
        description="Per-line due date (each SKU can have a different due date)",
    )


class SOLineUpdate(BaseModel):
    """Partial update for an SO line.  unit_price is locked at creation."""
    ordered_qty: Optional[int] = Field(None, ge=1)
    due_date: Optional[date] = None


class SOLineOut(BaseModel):
    """Response representation of an SO line."""
    id: int
    sales_order_id: int
    sku_id: int
    line_number: int
    ordered_qty: int
    unit_price: Decimal
    due_date: Optional[date] = None
    delivered_qty: int
    invoiced_qty: int
    remaining_qty: int
    invoiceable_qty: int
    # Denormalized for readability
    sku_code: Optional[str] = None
    sku_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════
#  SALES ORDER
# ═══════════════════════════════════════════════════════════

class SOCreate(BaseModel):
    """POST /sales-orders body."""
    order_number: str = Field(
        ..., min_length=1, max_length=100,
        examples=["SO-2026-0001"],
    )
    client_id: int
    ship_to_address_id: Optional[int] = None
    order_date: Optional[date] = Field(
        None, description="Date the customer placed the order (from their PO)",
    )
    due_date: Optional[date] = Field(
        None, description="Overall due date for the entire Sales Order",
    )
    original_pdf_url: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = None
    lines: list[SOLineCreate] = Field(
        default=[],
        description="Line items – tier prices are auto-resolved if unit_price omitted",
    )


class SOUpdate(BaseModel):
    """PATCH /sales-orders/{id} body.  Only include fields you want to change."""
    order_number: Optional[str] = Field(None, min_length=1, max_length=100)
    ship_to_address_id: Optional[int] = None
    order_date: Optional[date] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


class SOListOut(BaseModel):
    """Lightweight representation for list endpoints."""
    id: int
    order_number: str
    client_id: int
    client_name: Optional[str] = None
    status: SOStatus
    order_date: Optional[date] = None
    due_date: Optional[date] = None
    line_count: int = 0
    total_amount: Decimal = Decimal("0.00")
    created_at: datetime

    model_config = {"from_attributes": True}


class SODetailOut(BaseModel):
    """Full representation with nested line items."""
    id: int
    order_number: str
    client_id: int
    client_name: Optional[str] = None
    ship_to_address_id: Optional[int] = None
    status: SOStatus
    order_date: Optional[date] = None
    due_date: Optional[date] = None
    original_pdf_url: Optional[str] = None
    notes: Optional[str] = None
    created_by: int
    creator_name: Optional[str] = None
    is_deletable: bool = False
    created_at: datetime
    updated_at: datetime
    lines: list[SOLineOut] = []

    model_config = {"from_attributes": True}
