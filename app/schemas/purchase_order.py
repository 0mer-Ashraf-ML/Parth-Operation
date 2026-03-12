"""
Pydantic schemas for Purchase Order and PO Line endpoints.

Naming convention:
  • *Create   – POST request body
  • *Update   – PATCH request body (all fields optional)
  • *Out      – response body (what the API returns)
"""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import POStatus, ShipmentType


# ═══════════════════════════════════════════════════════════
#  PO LINE
# ═══════════════════════════════════════════════════════════

class POLineOut(BaseModel):
    """Response representation of a PO line."""
    id: int
    purchase_order_id: int
    so_line_id: int
    sku_id: int
    quantity: int
    due_date: Optional[date] = None
    expected_ship_date: Optional[date] = None
    expected_arrival_date: Optional[date] = None
    created_at: datetime
    # Denormalized for readability
    sku_code: Optional[str] = None
    sku_name: Optional[str] = None

    model_config = {"from_attributes": True}


class POLineUpdate(BaseModel):
    """Vendor / Admin can update per-line dates."""
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
    """PATCH /purchase-orders/{id} body."""
    status: Optional[POStatus] = Field(
        None,
        description="Move PO to next status (validated against flow)",
    )
    shipment_type: Optional[ShipmentType] = Field(
        None,
        description="Change shipment type (only while IN_PRODUCTION)",
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
    is_deletable: bool = False
    created_at: datetime
    updated_at: datetime
    lines: list[POLineOut] = []

    model_config = {"from_attributes": True}
