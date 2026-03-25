"""
Pydantic schemas for Purchase Order and PO Line endpoints.

PO Lines carry all delivery tracking: status, delivered_qty,
remaining_qty, plus per-line schedule dates.

PO header status is AUTO-DERIVED from line items:
  • STARTED:   at least one line is not yet DELIVERED.
  • COMPLETED: ALL lines are DELIVERED.
PO-level status is NOT manually settable.

unit_cost on PO lines = what we pay the vendor per unit.
Auto-pulled from SKUVendor.vendor_cost during PO generation.
Tier pricing (what we charge clients) is NEVER exposed on the PO side.

Naming convention:
  • *Create   – POST request body
  • *Update   – PATCH request body (all fields optional)
  • *Out      – response body (what the API returns)
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import POLineStatus, POStatus, ShipmentType


# ═══════════════════════════════════════════════════════════
#  PO LINE
# ═══════════════════════════════════════════════════════════

class POLineOut(BaseModel):
    """Response representation of a PO line (includes delivery tracking + cost)."""
    id: int
    purchase_order_id: int
    so_line_id: int
    sku_id: int
    quantity: int
    unit_cost: Optional[Decimal] = None
    line_total: Optional[Decimal] = None  # unit_cost × quantity
    status: POLineStatus
    delivered_qty: int = 0
    remaining_qty: int = 0
    is_fully_delivered: bool = False
    due_date: Optional[date] = None
    expected_ship_date: Optional[date] = None
    expected_arrival_date: Optional[date] = None
    created_at: datetime
    # Denormalized for readability
    sku_code: Optional[str] = None
    sku_name: Optional[str] = None

    model_config = {"from_attributes": True}


class POLineUpdate(BaseModel):
    """Vendor / Admin can update per-line dates and status."""
    status: Optional[POLineStatus] = Field(
        None,
        description="Update per-line status (validated against shipment type flow)",
    )
    due_date: Optional[date] = None
    expected_ship_date: Optional[date] = None
    expected_arrival_date: Optional[date] = None


# ═══════════════════════════════════════════════════════════
#  PURCHASE ORDER
# ═══════════════════════════════════════════════════════════

class POGenerateRequest(BaseModel):
    """POST /sales-orders/{so_id}/generate-pos body."""
    shipment_type: ShipmentType = Field(
        ShipmentType.DROP_SHIP,
        description="Default shipment type for all generated POs",
    )


class POUpdate(BaseModel):
    """
    PATCH /purchase-orders/{id} body.

    NOTE: PO header status is auto-derived from line items and cannot
    be changed manually.  Only shipment_type and dates are editable.
    """
    shipment_type: Optional[ShipmentType] = Field(
        None,
        description="Change shipment type (only while STARTED / IN_PRODUCTION)",
    )
    expected_ship_date: Optional[date] = Field(
        None,
        description="When vendor expects to ship goods",
    )
    expected_arrival_date: Optional[date] = Field(
        None,
        description="When goods are expected to arrive",
    )


class POListOut(BaseModel):
    """Lightweight representation for list endpoints."""
    id: int
    po_number: str
    sales_order_id: int
    so_order_number: Optional[str] = None
    vendor_id: int
    vendor_name: Optional[str] = None
    client_name: Optional[str] = None
    shipment_type: ShipmentType
    status: POStatus
    expected_ship_date: Optional[date] = None
    expected_arrival_date: Optional[date] = None
    line_count: int = 0
    total_quantity: int = 0
    total_delivered: int = 0
    total_cost: Optional[Decimal] = None  # sum of (unit_cost × quantity) across lines
    created_at: datetime

    model_config = {"from_attributes": True}


class PODetailOut(BaseModel):
    """Full representation with nested PO lines."""
    id: int
    po_number: str
    sales_order_id: int
    so_order_number: Optional[str] = None
    vendor_id: int
    vendor_name: Optional[str] = None
    client_name: Optional[str] = None
    shipment_type: ShipmentType
    status: POStatus
    expected_ship_date: Optional[date] = None
    expected_arrival_date: Optional[date] = None
    total_quantity: int = 0
    total_delivered: int = 0
    total_cost: Optional[Decimal] = None  # sum of (unit_cost × quantity) across lines
    is_deletable: bool = False
    created_at: datetime
    updated_at: datetime
    lines: list[POLineOut] = []

    model_config = {"from_attributes": True}
