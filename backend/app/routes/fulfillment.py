"""
Fulfillment routes – PO-line-centric delivery event recording and querying.

All delivery tracking lives on the PO side.  Fulfillment events are
recorded against PO lines, NOT SO lines.

Permission matrix:
    Action                      │ Admin │ AM          │ Vendor
    ────────────────────────────┼───────┼─────────────┼───────
    Record fulfillment event    │  ✓    │  ✓ (scoped) │  ✓ (own POs)
    List events for PO line     │  ✓    │  ✓ (scoped) │  ✓ (own POs)
    List events for PO          │  ✓    │  ✓ (scoped) │  ✓ (own POs)
    Get fulfillment overview    │  ✓    │  ✓ (scoped) │  ✓ (own POs)
    Get single event            │  ✓    │  ✓ (scoped) │  ✓ (own POs)

    "scoped" = AM sees only assigned clients' POs (via SO → client).
    "own POs" = Vendor sees only their own POs.

Note: fulfillment events are IMMUTABLE – no PUT, PATCH, or DELETE endpoints.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_any_role
from app.schemas.auth import CurrentUser
from app.schemas.fulfillment import (
    FulfillmentEventCreate,
    FulfillmentEventOut,
    POFulfillmentOverview,
    POLineFulfillmentSummary,
)
from app.services import fulfillment as fulfillment_svc

router = APIRouter(prefix="/fulfillment", tags=["Fulfillment"])


# ═══════════════════════════════════════════════════════════
#  RECORD EVENT
# ═══════════════════════════════════════════════════════════

@router.post(
    "/events",
    status_code=201,
    summary="Record a delivery / fulfillment event against a PO line",
    response_description="The newly created immutable fulfillment event",
)
def record_fulfillment_event(
    body: FulfillmentEventCreate,
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    """
    Record a delivery event against a PO line.

    - Quantity must be > 0 and must not cause total delivered to exceed ordered.
    - Admin/AM: can record for any accessible PO line.
    - Vendor: can record for PO lines in their own POs.
    - Events are IMMUTABLE – they cannot be edited or deleted.
    - After recording, the PO line's delivered_qty is updated.
    """
    event = fulfillment_svc.record_fulfillment_event(db, current_user, body)
    return {
        "success": True,
        "data": _event_to_out(event),
    }


# ═══════════════════════════════════════════════════════════
#  QUERY EVENTS
# ═══════════════════════════════════════════════════════════

@router.get(
    "/events/{event_id}",
    summary="Get a single fulfillment event by ID",
)
def get_event(
    event_id: int,
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    """Retrieve a single fulfillment event. Permission-checked via the parent PO."""
    event = fulfillment_svc.get_fulfillment_event(db, current_user, event_id)
    return {
        "success": True,
        "data": _event_to_out(event),
    }


@router.get(
    "/po-lines/{po_line_id}/events",
    summary="List all fulfillment events for a specific PO line",
)
def list_events_for_po_line(
    po_line_id: int,
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    """
    Retrieve all delivery events recorded against a specific PO line.
    Events are returned in chronological order (oldest first).
    """
    events = fulfillment_svc.list_events_for_po_line(db, current_user, po_line_id)
    return {
        "success": True,
        "data": [_event_to_out(e) for e in events],
    }


@router.get(
    "/purchase-orders/{po_id}/events",
    summary="List all fulfillment events for a Purchase Order",
)
def list_events_for_po(
    po_id: int,
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    """
    Retrieve all delivery events for ALL lines of a Purchase Order.
    Events are returned in chronological order (oldest first).
    """
    events = fulfillment_svc.list_events_for_purchase_order(db, current_user, po_id)
    return {
        "success": True,
        "data": [_event_to_out(e) for e in events],
    }


@router.get(
    "/purchase-orders/{po_id}/overview",
    summary="Get fulfillment overview for a Purchase Order",
)
def get_fulfillment_overview(
    po_id: int,
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    """
    Get a structured overview showing delivery progress per PO line:
    quantity, delivered_qty, remaining_qty, is_fully_delivered,
    per-line status, plus all fulfillment events nested under each line.
    """
    overview = fulfillment_svc.get_fulfillment_overview(db, current_user, po_id)
    return {
        "success": True,
        "data": overview,
    }


# ═══════════════════════════════════════════════════════════
#  RESPONSE BUILDER
# ═══════════════════════════════════════════════════════════

def _event_to_out(event) -> dict:
    """Build the response dict for a fulfillment event."""
    po_line = event.po_line
    recorder = event.recorder

    # Get PO number and SO order number via the chain
    po_number = None
    so_order_number = None
    if po_line and po_line.purchase_order:
        po_number = po_line.purchase_order.po_number
        if po_line.purchase_order.sales_order:
            so_order_number = po_line.purchase_order.sales_order.order_number

    return FulfillmentEventOut(
        id=event.id,
        po_line_id=event.po_line_id,
        quantity=event.quantity,
        recorded_by=event.recorded_by,
        recorder_name=recorder.full_name if recorder else None,
        source=event.source,
        notes=event.notes,
        created_at=event.created_at,
        sku_code=po_line.sku.sku_code if po_line and po_line.sku else None,
        sku_name=po_line.sku.name if po_line and po_line.sku else None,
        po_number=po_number,
        so_order_number=so_order_number,
    ).model_dump()
