"""
Fulfillment routes – append-only delivery event recording and querying.

Permission matrix:
    Action                     │ Admin │ AM          │ Vendor
    ───────────────────────────┼───────┼─────────────┼───────
    Record fulfillment event   │  ✓    │  ✓ (scoped) │  ✓ (own POs)
    List events for SO line    │  ✓    │  ✓ (scoped) │  ✓ (own POs)
    List events for SO         │  ✓    │  ✓ (scoped) │  ✗
    Get fulfillment overview   │  ✓    │  ✓ (scoped) │  ✗
    Get single event           │  ✓    │  ✓ (scoped) │  ✓ (own POs)

    "scoped" = AM sees only assigned clients' data.
    "own POs" = Vendor sees only events for SO lines linked to their POs.

Note: fulfillment events are IMMUTABLE – no PUT, PATCH, or DELETE endpoints.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_admin_or_am, require_any_role
from app.schemas.auth import CurrentUser
from app.schemas.fulfillment import (
    FulfillmentEventCreate,
    FulfillmentEventOut,
    FulfillmentSummaryOut,
    SOFulfillmentOverview,
)
from app.services import fulfillment as fulfillment_svc

router = APIRouter(prefix="/fulfillment", tags=["Fulfillment"])


# ═══════════════════════════════════════════════════════════
#  RECORD EVENT
# ═══════════════════════════════════════════════════════════

@router.post(
    "/events",
    status_code=201,
    summary="Record a delivery / fulfillment event",
    response_description="The newly created immutable fulfillment event",
)
def record_fulfillment_event(
    body: FulfillmentEventCreate,
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    """
    Record a delivery event against an SO line.

    - Quantity must be > 0 and must not cause total delivered to exceed ordered.
    - Admin/AM: can record for any accessible SO line.
    - Vendor: can record for SO lines linked to their own POs.
    - Events are IMMUTABLE – they cannot be edited or deleted.
    - After recording, the SO line's delivered_qty is updated and the
      parent SO's status is re-derived automatically.
    """
    event = fulfillment_svc.record_fulfillment_event(db, current_user, body)
    return {
        "success": True,
        "data": _event_to_out(event, db),
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
    """Retrieve a single fulfillment event. Permission-checked via the parent SO's client."""
    event = fulfillment_svc.get_fulfillment_event(db, current_user, event_id)
    return {
        "success": True,
        "data": _event_to_out(event, db),
    }


@router.get(
    "/so-lines/{so_line_id}/events",
    summary="List all fulfillment events for a specific SO line",
)
def list_events_for_line(
    so_line_id: int,
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    """
    Retrieve all delivery events recorded against a specific SO line.
    Events are returned in chronological order (oldest first).

    - Admin/AM: accessible if they have access to the SO's client.
    - Vendor: accessible if they have a PO linked to this SO.
    """
    events = fulfillment_svc.list_events_for_so_line(db, current_user, so_line_id)
    return {
        "success": True,
        "data": [_event_to_out(e, db) for e in events],
    }


@router.get(
    "/sales-orders/{so_id}/events",
    summary="List all fulfillment events for a Sales Order",
)
def list_events_for_so(
    so_id: int,
    current_user: CurrentUser = Depends(require_admin_or_am),
    db: Session = Depends(get_db),
):
    """
    Retrieve all delivery events for ALL lines of a Sales Order.
    Events are returned in chronological order (oldest first).
    Admin and AM only (Vendor doesn't have SO-level access).
    """
    events = fulfillment_svc.list_events_for_sales_order(db, current_user, so_id)
    return {
        "success": True,
        "data": [_event_to_out(e, db) for e in events],
    }


@router.get(
    "/sales-orders/{so_id}/overview",
    summary="Get fulfillment overview for a Sales Order",
)
def get_fulfillment_overview(
    so_id: int,
    current_user: CurrentUser = Depends(require_admin_or_am),
    db: Session = Depends(get_db),
):
    """
    Get a structured overview showing delivery progress per SO line:
    ordered_qty, delivered_qty, remaining_qty, is_fully_delivered,
    plus all fulfillment events nested under each line.

    Admin and AM only.
    """
    overview = fulfillment_svc.get_fulfillment_overview(db, current_user, so_id)
    return {
        "success": True,
        "data": overview,
    }


# ═══════════════════════════════════════════════════════════
#  RESPONSE BUILDER
# ═══════════════════════════════════════════════════════════

def _event_to_out(event, db: Session = None) -> dict:
    """Build the response dict for a fulfillment event."""
    so_line = event.so_line
    recorder = event.recorder

    # Get PO number if linked
    po_number = None
    if event.po_line_id and event.po_line:
        if event.po_line.purchase_order:
            po_number = event.po_line.purchase_order.po_number

    return FulfillmentEventOut(
        id=event.id,
        so_line_id=event.so_line_id,
        po_line_id=event.po_line_id,
        quantity=event.quantity,
        recorded_by=event.recorded_by,
        recorder_name=recorder.full_name if recorder else None,
        source=event.source,
        notes=event.notes,
        created_at=event.created_at,
        sku_code=so_line.sku.sku_code if so_line and so_line.sku else None,
        sku_name=so_line.sku.name if so_line and so_line.sku else None,
        so_order_number=so_line.sales_order.order_number if so_line and so_line.sales_order else None,
        so_line_number=so_line.line_number if so_line else None,
        po_number=po_number,
    ).model_dump()
