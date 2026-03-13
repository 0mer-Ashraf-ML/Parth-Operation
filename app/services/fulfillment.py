"""
Fulfillment service – append-only delivery event recording.

Key business rules:
  • Every delivery is recorded as an immutable FulfillmentEvent.
  • Events are NEVER updated or deleted – they form a permanent audit trail.
  • When an event is recorded:
      1. The SO line's delivered_qty is recalculated (SUM of all events).
      2. A guard ensures delivered_qty never exceeds ordered_qty.
      3. The parent SO's status is re-derived:
             PENDING → PARTIAL_DELIVERED → DELIVERED
  • Permission scoping:
      - Admin: can record events for any SO line.
      - AM: can record events only for their assigned clients' SOs.
      - Vendor: can record events only for SO lines linked to their POs.
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
from app.models.sales_order import SalesOrder, SOLine
from app.schemas.auth import CurrentUser
from app.schemas.fulfillment import FulfillmentEventCreate
from app.services.permissions import PermissionService
from app.services.sales_order import _derive_and_persist_status


# ═══════════════════════════════════════════════════════════
#  RECORD FULFILLMENT EVENT
# ═══════════════════════════════════════════════════════════

def record_fulfillment_event(
    db: Session,
    current_user: CurrentUser,
    data: FulfillmentEventCreate,
) -> FulfillmentEvent:
    """
    Record a delivery event against an SO line.

    Steps:
      1. Validate SO line exists and user has access.
      2. Validate PO line link (if provided).
      3. Guard: new total delivered_qty must not exceed ordered_qty.
      4. Create the immutable FulfillmentEvent row.
      5. Update SO line's delivered_qty.
      6. Re-derive the parent SO's status.
    """
    # 1. Load SO line with its parent SO
    so_line = db.execute(
        select(SOLine)
        .options(
            selectinload(SOLine.sales_order).selectinload(SalesOrder.client),
            selectinload(SOLine.sku),
        )
        .where(SOLine.id == data.so_line_id)
    ).scalar_one_or_none()

    if so_line is None:
        raise NotFoundException(f"SO Line with id={data.so_line_id} not found")

    # Permission check: Admin or AM (for assigned client)
    _assert_can_record_event(current_user, so_line, db)

    # 2. Validate PO line link (optional)
    if data.po_line_id is not None:
        po_line = db.execute(
            select(POLine)
            .options(selectinload(POLine.purchase_order))
            .where(POLine.id == data.po_line_id)
        ).scalar_one_or_none()

        if po_line is None:
            raise NotFoundException(f"PO Line with id={data.po_line_id} not found")

        # Ensure PO line references the same SO line
        if po_line.so_line_id != so_line.id:
            raise BadRequestException(
                f"PO Line id={data.po_line_id} does not reference "
                f"SO Line id={so_line.id}"
            )

    # 3. Guard: delivered_qty + new quantity must not exceed ordered_qty
    current_delivered = _sum_fulfilled_qty(db, so_line.id)
    new_total = current_delivered + data.quantity

    if new_total > so_line.ordered_qty:
        raise BadRequestException(
            f"Over-delivery: SO line {so_line.id} has ordered_qty={so_line.ordered_qty}, "
            f"already delivered={current_delivered}, trying to add {data.quantity} "
            f"(total would be {new_total}). "
            f"Maximum additional delivery allowed: {so_line.ordered_qty - current_delivered}"
        )

    # 4. Create the event (immutable, append-only)
    event = FulfillmentEvent(
        so_line_id=so_line.id,
        po_line_id=data.po_line_id,
        quantity=data.quantity,
        recorded_by=current_user.user_id,
        source=data.source,
        notes=data.notes,
    )
    db.add(event)

    # 5. Update SO line's delivered_qty (denormalized counter)
    so_line.delivered_qty = new_total
    db.flush()

    # 6. Re-derive SO status
    _derive_and_persist_status(db, so_line.sales_order_id)

    db.commit()
    db.refresh(event)
    return event


# ═══════════════════════════════════════════════════════════
#  LIST / GET EVENTS
# ═══════════════════════════════════════════════════════════

def list_events_for_so_line(
    db: Session,
    current_user: CurrentUser,
    so_line_id: int,
) -> list[FulfillmentEvent]:
    """
    Return all fulfillment events for a specific SO line.
    Permission-checked via the parent SO's client.
    """
    so_line = _get_so_line_or_404(db, so_line_id)
    _assert_can_view_events(current_user, so_line, db)

    events = db.execute(
        select(FulfillmentEvent)
        .options(
            selectinload(FulfillmentEvent.recorder),
            selectinload(FulfillmentEvent.so_line).selectinload(SOLine.sku),
            selectinload(FulfillmentEvent.so_line).selectinload(SOLine.sales_order),
            selectinload(FulfillmentEvent.po_line).selectinload(POLine.purchase_order),
        )
        .where(FulfillmentEvent.so_line_id == so_line_id)
        .order_by(FulfillmentEvent.created_at.asc())
    ).scalars().all()
    return list(events)


def list_events_for_sales_order(
    db: Session,
    current_user: CurrentUser,
    so_id: int,
) -> list[FulfillmentEvent]:
    """
    Return all fulfillment events for ALL lines of a Sales Order.
    Permission-checked via the SO's client.
    """
    so = db.execute(
        select(SalesOrder)
        .options(selectinload(SalesOrder.lines))
        .where(SalesOrder.id == so_id)
    ).scalar_one_or_none()

    if so is None:
        raise NotFoundException(f"Sales Order with id={so_id} not found")

    PermissionService.assert_can_access_client(current_user, so.client_id)

    so_line_ids = [line.id for line in so.lines]
    if not so_line_ids:
        return []

    events = db.execute(
        select(FulfillmentEvent)
        .options(
            selectinload(FulfillmentEvent.recorder),
            selectinload(FulfillmentEvent.so_line).selectinload(SOLine.sku),
            selectinload(FulfillmentEvent.so_line).selectinload(SOLine.sales_order),
            selectinload(FulfillmentEvent.po_line).selectinload(POLine.purchase_order),
        )
        .where(FulfillmentEvent.so_line_id.in_(so_line_ids))
        .order_by(FulfillmentEvent.created_at.asc())
    ).scalars().all()
    return list(events)


def get_fulfillment_overview(
    db: Session,
    current_user: CurrentUser,
    so_id: int,
) -> dict:
    """
    Build a complete fulfillment overview for a Sales Order:
    for each SO line, show ordered/delivered/remaining quantities
    and all associated fulfillment events.
    """
    so = db.execute(
        select(SalesOrder)
        .options(
            selectinload(SalesOrder.lines).selectinload(SOLine.sku),
            selectinload(SalesOrder.lines).selectinload(SOLine.fulfillment_events)
            .selectinload(FulfillmentEvent.recorder),
        )
        .where(SalesOrder.id == so_id)
    ).scalar_one_or_none()

    if so is None:
        raise NotFoundException(f"Sales Order with id={so_id} not found")

    PermissionService.assert_can_access_client(current_user, so.client_id)

    # Also load PO line -> PO relationships for events that have po_line_id
    # We'll need this for the po_number in the event output
    all_events = []
    for line in so.lines:
        all_events.extend(line.fulfillment_events)

    po_line_ids = [e.po_line_id for e in all_events if e.po_line_id]
    po_line_map: dict[int, POLine] = {}
    if po_line_ids:
        po_lines = db.execute(
            select(POLine)
            .options(selectinload(POLine.purchase_order))
            .where(POLine.id.in_(po_line_ids))
        ).scalars().all()
        po_line_map = {pl.id: pl for pl in po_lines}

    return _build_overview(so, po_line_map)


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
            selectinload(FulfillmentEvent.so_line).selectinload(SOLine.sku),
            selectinload(FulfillmentEvent.so_line).selectinload(SOLine.sales_order),
            selectinload(FulfillmentEvent.po_line).selectinload(POLine.purchase_order),
        )
        .where(FulfillmentEvent.id == event_id)
    ).scalar_one_or_none()

    if event is None:
        raise NotFoundException(f"Fulfillment event with id={event_id} not found")

    # Permission check via the parent SO's client
    so_line = event.so_line
    if so_line and so_line.sales_order:
        _assert_can_view_events(current_user, so_line, db)

    return event


# ═══════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════

def _sum_fulfilled_qty(db: Session, so_line_id: int) -> int:
    """Sum all fulfillment event quantities for an SO line."""
    result = db.execute(
        select(sa_func.coalesce(sa_func.sum(FulfillmentEvent.quantity), 0))
        .where(FulfillmentEvent.so_line_id == so_line_id)
    ).scalar()
    return int(result)


def _get_so_line_or_404(db: Session, so_line_id: int) -> SOLine:
    """Load an SO line with its parent SO."""
    so_line = db.execute(
        select(SOLine)
        .options(selectinload(SOLine.sales_order))
        .where(SOLine.id == so_line_id)
    ).scalar_one_or_none()
    if so_line is None:
        raise NotFoundException(f"SO Line with id={so_line_id} not found")
    return so_line


def _assert_can_record_event(
    current_user: CurrentUser,
    so_line: SOLine,
    db: Session,
) -> None:
    """
    Check if the user can record a fulfillment event.

    • Admin: always OK.
    • AM: must have access to the SO's client.
    • Vendor: must have a PO linked to this SO line's parent SO,
              AND their vendor_id must match one of those POs.
    """
    if current_user.role == UserRole.ADMIN:
        return

    if current_user.role == UserRole.ACCOUNT_MANAGER:
        PermissionService.assert_can_access_client(
            current_user, so_line.sales_order.client_id,
        )
        return

    if current_user.role == UserRole.VENDOR:
        # Vendor can record delivery events ONLY for SO lines that have
        # a corresponding PO line in one of THEIR Purchase Orders.
        if current_user.vendor_id is None:
            raise ForbiddenException("Vendor account is not linked to a vendor record")

        # Check if there's a PO LINE for this vendor linked to this specific SO line
        vendor_po_line = db.execute(
            select(POLine)
            .join(PurchaseOrder, POLine.purchase_order_id == PurchaseOrder.id)
            .where(
                POLine.so_line_id == so_line.id,
                PurchaseOrder.vendor_id == current_user.vendor_id,
            )
        ).scalar_one_or_none()

        if vendor_po_line is None:
            raise ForbiddenException(
                "You can only record delivery events for SO lines "
                "linked to your own Purchase Orders"
            )
        return

    raise ForbiddenException("Access denied")


def _assert_can_view_events(
    current_user: CurrentUser,
    so_line: SOLine,
    db: Session,
) -> None:
    """
    Check if the user can view fulfillment events for an SO line.

    • Admin: always OK.
    • AM: must have access to the SO's client.
    • Vendor: must have a PO line linked to this specific SO line.
    """
    if current_user.role == UserRole.ADMIN:
        return

    if current_user.role == UserRole.ACCOUNT_MANAGER:
        PermissionService.assert_can_access_client(
            current_user, so_line.sales_order.client_id,
        )
        return

    if current_user.role == UserRole.VENDOR:
        if current_user.vendor_id is None:
            raise ForbiddenException("Vendor account is not linked to a vendor record")

        # Check if there's a PO LINE for this vendor linked to this specific SO line
        vendor_po_line = db.execute(
            select(POLine)
            .join(PurchaseOrder, POLine.purchase_order_id == PurchaseOrder.id)
            .where(
                POLine.so_line_id == so_line.id,
                PurchaseOrder.vendor_id == current_user.vendor_id,
            )
        ).scalar_one_or_none()

        if vendor_po_line is None:
            raise ForbiddenException(
                "You can only view delivery events for SO lines "
                "linked to your own Purchase Orders"
            )
        return

    raise ForbiddenException("Access denied")


def _build_overview(so: SalesOrder, po_line_map: dict[int, POLine]) -> dict:
    """Build the structured overview dict for an SO."""
    lines_summary = []
    for line in so.lines:
        events_out = []
        for evt in sorted(line.fulfillment_events, key=lambda e: e.created_at):
            po_number = None
            if evt.po_line_id and evt.po_line_id in po_line_map:
                pl = po_line_map[evt.po_line_id]
                po_number = pl.purchase_order.po_number if pl.purchase_order else None

            events_out.append({
                "id": evt.id,
                "so_line_id": evt.so_line_id,
                "po_line_id": evt.po_line_id,
                "quantity": evt.quantity,
                "recorded_by": evt.recorded_by,
                "recorder_name": evt.recorder.full_name if evt.recorder else None,
                "source": evt.source.value,
                "notes": evt.notes,
                "created_at": evt.created_at.isoformat() if evt.created_at else None,
                "sku_code": line.sku.sku_code if line.sku else None,
                "sku_name": line.sku.name if line.sku else None,
                "so_order_number": so.order_number,
                "so_line_number": line.line_number,
                "po_number": po_number,
            })

        lines_summary.append({
            "so_line_id": line.id,
            "sku_code": line.sku.sku_code if line.sku else None,
            "sku_name": line.sku.name if line.sku else None,
            "line_number": line.line_number,
            "ordered_qty": line.ordered_qty,
            "delivered_qty": line.delivered_qty,
            "remaining_qty": line.remaining_qty,
            "is_fully_delivered": line.delivered_qty >= line.ordered_qty,
            "event_count": len(events_out),
            "events": events_out,
        })

    return {
        "sales_order_id": so.id,
        "order_number": so.order_number,
        "status": so.status.value,
        "lines": lines_summary,
    }
