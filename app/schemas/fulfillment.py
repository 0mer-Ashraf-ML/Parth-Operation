"""
Pydantic schemas for Fulfillment Event endpoints (PO-line-centric).

All delivery tracking lives on the PO side.  Fulfillment events are
recorded against PO lines, not SO lines.

Naming convention:
  • *Create  – POST request body
  • *Out     – response body (what the API returns)

Fulfillment events are APPEND-ONLY – there is no Update or Delete schema.
Once a delivery event is recorded, it can never be modified or removed.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import EventSource, POLineStatus


# ═══════════════════════════════════════════════════════════
#  FULFILLMENT EVENT
# ═══════════════════════════════════════════════════════════

class FulfillmentEventCreate(BaseModel):
    """
    POST /fulfillment/events body.

    Records a delivery of goods against a specific PO line.
    """
    po_line_id: int = Field(
        ..., description="The PO line that these goods are being delivered against",
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
    po_line_id: int
    quantity: int
    recorded_by: int
    recorder_name: Optional[str] = None
    source: EventSource
    notes: Optional[str] = None
    created_at: datetime

    # Denormalized context for readability
    sku_code: Optional[str] = None
    sku_name: Optional[str] = None
    po_number: Optional[str] = None
    so_order_number: Optional[str] = None

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════
#  PO LINE FULFILLMENT SUMMARY
# ═══════════════════════════════════════════════════════════

class POLineFulfillmentSummary(BaseModel):
    """
    Aggregated fulfillment summary for a single PO line.
    Shows delivery progress at a glance.
    """
    po_line_id: int
    sku_code: Optional[str] = None
    sku_name: Optional[str] = None
    status: POLineStatus
    quantity: int
    delivered_qty: int
    remaining_qty: int
    is_fully_delivered: bool
    event_count: int
    events: list[FulfillmentEventOut] = []

    model_config = {"from_attributes": True}


class POFulfillmentOverview(BaseModel):
    """
    Full fulfillment overview for a Purchase Order.
    Shows each line's delivery progress and all events.
    """
    purchase_order_id: int
    po_number: str
    status: str
    vendor_name: Optional[str] = None
    so_order_number: Optional[str] = None
    lines: list[POLineFulfillmentSummary] = []

    model_config = {"from_attributes": True}
