"""
Fulfillment service – PO-line-centric delivery event recording.

Key business rules:
  • Every delivery is recorded as an immutable FulfillmentEvent against a PO line.
  • Events are NEVER updated or deleted – they form a permanent audit trail.
  • When an event is recorded:
      1. The PO line's delivered_qty is recalculated (SUM of all events).
      2. A guard ensures delivered_qty never exceeds quantity.
  • Permission scoping:
      - Admin: can record events for any PO line.
      - AM: can record events only for POs whose SO belongs to assigned clients.
      - Vendor: can record events only for their own POs.
"""

from sqlalchemy import func as sa_func, select
from sqlalchemy.orm import Session, selectinload

from app.exceptions import (
    BadRequestException,
    ForbiddenException,
    NotFoundException,
)
from app.models.enums import EventSource, UserRole
from app.models.fulfillment import FulfillmentEvent
from app.models.purchase_order import POLine, PurchaseOrder
from app.models.sales_order import SalesOrder
from app.schemas.auth import CurrentUser
from app.schemas.fulfillment import FulfillmentEventCreate


# ═══════════════════════════════════════════════════════════
#  RECORD FULFILLMENT EVENT
# ═══════════════════════════════════════════════════════════

def record_fulfillment_event(
    db: Session,
    current_user: CurrentUser,
    data: FulfillmentEventCreate,
) -> FulfillmentEvent:
    """
    Record a delivery event against a PO line.

    Steps:
      1. Validate PO line exists and user has access.
      2. Guard: new total delivered_qty must not exceed quantity.
      3. Create the immutable FulfillmentEvent row.
      4. Update PO line's delivered_qty.
    """
    # 1. Load PO line with its parent PO + vendor + SO
    po_line = db.execute(
        select(POLine)
        .options(
            selectinload(POLine.purchase_order)
            .selectinload(PurchaseOrder.vendor),
            selectinload(POLine.purchase_order)
            .selectinload(PurchaseOrder.sales_order)
            .selectinload(SalesOrder.client),
            selectinload(POLine.sku),
        )
        .where(POLine.id == data.po_line_id)
    ).scalar_one_or_none()

    if po_line is None:
        raise NotFoundException(f"PO Line with id={data.po_line_id} not found")

    # Permission check
    _assert_can_record_event(current_user, po_line)

    # 2. Guard: delivered_qty + new quantity must not exceed quantity
    current_delivered = _sum_fulfilled_qty(db, po_line.id)
    new_total = current_delivered + data.quantity

    if new_total > po_line.quantity:
        raise BadRequestException(
            f"Over-delivery: PO line {po_line.id} has quantity={po_line.quantity}, "
            f"already delivered={current_delivered}, trying to add {data.quantity} "
            f"(total would be {new_total}). "
            f"Maximum additional delivery allowed: {po_line.quantity - current_delivered}"
        )

    # 3. Create the event (immutable, append-only)
    event = FulfillmentEvent(
        po_line_id=po_line.id,
        quantity=data.quantity,
        recorded_by=current_user.user_id,
        source=data.source,
        notes=data.notes,
    )
    db.add(event)

    # 4. Update PO line's delivered_qty (denormalized counter)
    po_line.delivered_qty = new_total
    db.flush()

    db.commit()
    db.refresh(event)
    return event


# ═══════════════════════════════════════════════════════════
#  LIST / GET EVENTS
# ═══════════════════════════════════════════════════════════

def list_events_for_po_line(
    db: Session,
    current_user: CurrentUser,
    po_line_id: int,
) -> list[FulfillmentEvent]:
    """
    Return all fulfillment events for a specific PO line.
    Permission-checked via the parent PO.
    """
    po_line = _get_po_line_or_404(db, po_line_id)
    _assert_can_view_events(current_user, po_line)

    events = db.execute(
        select(FulfillmentEvent)
        .options(
            selectinload(FulfillmentEvent.recorder),
            selectinload(FulfillmentEvent.po_line)
            .selectinload(POLine.sku),
            selectinload(FulfillmentEvent.po_line)
            .selectinload(POLine.purchase_order),
        )
        .where(FulfillmentEvent.po_line_id == po_line_id)
        .order_by(FulfillmentEvent.created_at.asc())
    ).scalars().all()
    return list(events)


def list_events_for_purchase_order(
    db: Session,
    current_user: CurrentUser,
    po_id: int,
) -> list[FulfillmentEvent]:
    """
    Return all fulfillment events for ALL lines of a Purchase Order.
    Permission-checked via the PO.
    """
    po = db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .where(PurchaseOrder.id == po_id)
    ).scalar_one_or_none()

    if po is None:
        raise NotFoundException(f"Purchase Order with id={po_id} not found")

    _assert_can_access_po(current_user, po)

    po_line_ids = [line.id for line in po.lines]
    if not po_line_ids:
        return []

    events = db.execute(
        select(FulfillmentEvent)
        .options(
            selectinload(FulfillmentEvent.recorder),
            selectinload(FulfillmentEvent.po_line)
            .selectinload(POLine.sku),
            selectinload(FulfillmentEvent.po_line)
            .selectinload(POLine.purchase_order),
        )
        .where(FulfillmentEvent.po_line_id.in_(po_line_ids))
        .order_by(FulfillmentEvent.created_at.asc())
    ).scalars().all()
    return list(events)


def get_fulfillment_overview(
    db: Session,
    current_user: CurrentUser,
    po_id: int,
) -> dict:
    """
    Build a complete fulfillment overview for a Purchase Order:
    for each PO line, show quantity/delivered/remaining and
    all associated fulfillment events.
    """
    po = db.execute(
        select(PurchaseOrder)
        .options(
            selectinload(PurchaseOrder.vendor),
            selectinload(PurchaseOrder.sales_order),
            selectinload(PurchaseOrder.lines).selectinload(POLine.sku),
            selectinload(PurchaseOrder.lines)
            .selectinload(POLine.fulfillment_events)
            .selectinload(FulfillmentEvent.recorder),
        )
        .where(PurchaseOrder.id == po_id)
    ).scalar_one_or_none()

    if po is None:
        raise NotFoundException(f"Purchase Order with id={po_id} not found")

    _assert_can_access_po(current_user, po)

    return _build_overview(po)


def get_fulfillment_event(
    db: Session,
    current_user: CurrentUser,
    event_id: int,
) -> FulfillmentEvent:
    """Fetch a single fulfillment event by ID. Permission-checked."""
    event = db.execute(
        select(FulfillmentEvent)
        .options(
            selectinload(FulfillmentEvent.recorder),
            selectinload(FulfillmentEvent.po_line)
            .selectinload(POLine.sku),
            selectinload(FulfillmentEvent.po_line)
            .selectinload(POLine.purchase_order)
            .selectinload(PurchaseOrder.sales_order),
        )
        .where(FulfillmentEvent.id == event_id)
    ).scalar_one_or_none()

    if event is None:
        raise NotFoundException(f"Fulfillment event with id={event_id} not found")

    # Permission check via the parent PO
    if event.po_line and event.po_line.purchase_order:
        _assert_can_access_po(current_user, event.po_line.purchase_order)

    return event


# ═══════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════

def _sum_fulfilled_qty(db: Session, po_line_id: int) -> int:
    """Sum all fulfillment event quantities for a PO line."""
    result = db.execute(
        select(sa_func.coalesce(sa_func.sum(FulfillmentEvent.quantity), 0))
        .where(FulfillmentEvent.po_line_id == po_line_id)
    ).scalar()
    return int(result)


def _get_po_line_or_404(db: Session, po_line_id: int) -> POLine:
    """Load a PO line with its parent PO."""
    po_line = db.execute(
        select(POLine)
        .options(
            selectinload(POLine.purchase_order)
            .selectinload(PurchaseOrder.sales_order),
        )
        .where(POLine.id == po_line_id)
    ).scalar_one_or_none()
    if po_line is None:
        raise NotFoundException(f"PO Line with id={po_line_id} not found")
    return po_line


def _assert_can_record_event(
    current_user: CurrentUser,
    po_line: POLine,
) -> None:
    """
    Check if the user can record a fulfillment event.

    • Admin: always OK.
    • AM: must have access to the PO's parent SO's client.
    • Vendor: PO's vendor must match their vendor_id.
    """
    po = po_line.purchase_order
    if po is None:
        raise ForbiddenException("PO line has no parent Purchase Order")

    _assert_can_access_po(current_user, po)


def _assert_can_view_events(
    current_user: CurrentUser,
    po_line: POLine,
) -> None:
    """
    Check if the user can view fulfillment events for a PO line.
    Same rules as recording.
    """
    _assert_can_record_event(current_user, po_line)


def _assert_can_access_po(
    current_user: CurrentUser,
    po: PurchaseOrder,
) -> None:
    """
    Check if the user can access a Purchase Order.

    • Admin: always OK.
    • AM: SO's client must be in their assigned clients.
    • Vendor: PO's vendor must match their vendor_id.
    """
    if current_user.role == UserRole.ADMIN:
        return

    if current_user.role == UserRole.ACCOUNT_MANAGER:
        if po.sales_order and po.sales_order.client_id in current_user.client_ids:
            return
        raise ForbiddenException("You do not have access to this Purchase Order")

    if current_user.role == UserRole.VENDOR:
        if current_user.vendor_id is None:
            raise ForbiddenException("Vendor account is not linked to a vendor record")
        if current_user.vendor_id == po.vendor_id:
            return
        raise ForbiddenException("You can only access your own Purchase Orders")

    raise ForbiddenException("Access denied")


def _build_overview(po: PurchaseOrder) -> dict:
    """Build the structured overview dict for a PO."""
    lines_summary = []
    for line in po.lines:
        events_out = []
        for evt in sorted(line.fulfillment_events, key=lambda e: e.created_at):
            events_out.append({
                "id": evt.id,
                "po_line_id": evt.po_line_id,
                "quantity": evt.quantity,
                "recorded_by": evt.recorded_by,
                "recorder_name": evt.recorder.full_name if evt.recorder else None,
                "source": evt.source.value,
                "notes": evt.notes,
                "created_at": evt.created_at.isoformat() if evt.created_at else None,
                "sku_code": line.sku.sku_code if line.sku else None,
                "sku_name": line.sku.name if line.sku else None,
                "po_number": po.po_number,
                "so_order_number": (
                    po.sales_order.order_number if po.sales_order else None
                ),
            })

        lines_summary.append({
            "po_line_id": line.id,
            "sku_code": line.sku.sku_code if line.sku else None,
            "sku_name": line.sku.name if line.sku else None,
            "status": line.status.value,
            "quantity": line.quantity,
            "delivered_qty": line.delivered_qty,
            "remaining_qty": line.remaining_qty,
            "is_fully_delivered": line.delivered_qty >= line.quantity,
            "event_count": len(events_out),
            "events": events_out,
        })

    return {
        "purchase_order_id": po.id,
        "po_number": po.po_number,
        "status": po.status.value,
        "vendor_name": po.vendor.company_name if po.vendor else None,
        "so_order_number": (
            po.sales_order.order_number if po.sales_order else None
        ),
        "lines": lines_summary,
    }
