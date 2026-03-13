"""
Pydantic schemas for Fulfillment Event endpoints.

Naming convention:
  • *Create  – POST request body
  • *Out     – response body (what the API returns)

Fulfillment events are APPEND-ONLY – there is no Update or Delete schema.
Once a delivery event is recorded, it can never be modified or removed.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import EventSource


# ═══════════════════════════════════════════════════════════
#  FULFILLMENT EVENT
# ═══════════════════════════════════════════════════════════

class FulfillmentEventCreate(BaseModel):
    """
    POST /fulfillment-events body.

    Records a delivery of goods against a specific SO line.
    Optionally links to a PO line for full traceability.
    """
    so_line_id: int = Field(
        ..., description="The SO line that these goods are being delivered against",
    )
    po_line_id: Optional[int] = Field(
        None,
        description="Optional PO line link – for traceability (which PO shipment delivered this)",
    )
    quantity: int = Field(
        ..., gt=0,
        description="Number of units delivered in this event (must be > 0)",
        examples=[25],
    )
    source: EventSource = Field(
        EventSource.UI,
        description="Where this event was recorded from (ui / ai / system)",
    )
    notes: Optional[str] = Field(
        None,
        description="Free-text notes (e.g. 'partial shipment, rest ETA next week')",
        examples=["Partial delivery – 25 of 100 units received"],
    )


class FulfillmentEventOut(BaseModel):
    """Response representation of a single fulfillment event."""
    id: int
    so_line_id: int
    po_line_id: Optional[int] = None
    quantity: int
    recorded_by: int
    recorder_name: Optional[str] = None
    source: EventSource
    notes: Optional[str] = None
    created_at: datetime

    # Denormalized context for readability
    sku_code: Optional[str] = None
    sku_name: Optional[str] = None
    so_order_number: Optional[str] = None
    so_line_number: Optional[int] = None
    po_number: Optional[str] = None

    model_config = {"from_attributes": True}


class FulfillmentSummaryOut(BaseModel):
    """
    Aggregated fulfillment summary for a single SO line.
    Used in SO detail views to show delivery progress at a glance.
    """
    so_line_id: int
    sku_code: Optional[str] = None
    sku_name: Optional[str] = None
    line_number: int
    ordered_qty: int
    delivered_qty: int
    remaining_qty: int
    is_fully_delivered: bool
    event_count: int
    events: list[FulfillmentEventOut] = []

    model_config = {"from_attributes": True}


class SOFulfillmentOverview(BaseModel):
    """
    Full fulfillment overview for a Sales Order.
    Shows each line's delivery progress and all events.
    """
    sales_order_id: int
    order_number: str
    status: str
    lines: list[FulfillmentSummaryOut] = []

    model_config = {"from_attributes": True}
