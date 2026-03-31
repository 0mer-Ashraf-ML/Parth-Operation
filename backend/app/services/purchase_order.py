"""
Purchase Order service – auto-generation from SO and CRUD.

Key business rules:
  • POs are auto-generated from a Sales Order – ONE PO per vendor.
  • Vendor is resolved per SKU from sku_vendors (default) → SKU.default_vendor_id.
  • PO header status is AUTO-DERIVED:
      STARTED:   at least one line is not DELIVERED (default).
      COMPLETED: ALL lines are DELIVERED.
  • PO line status follows a fixed flow depending on shipment type:
      Drop-ship:  IN_PRODUCTION → PACKED_AND_SHIPPED → DELIVERED
      In-house:   IN_PRODUCTION → PACKED_AND_SHIPPED → READY_FOR_PICKUP → DELIVERED
  • Vendors can only see and update their own POs.
  • AMs can see POs whose parent SO belongs to their assigned clients.
  • When PO status changes, the parent SO status is auto-derived.
"""

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.exceptions import (
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
)
from app.models.enums import POLineStatus, POStatus, SOStatus, ShipmentType, UserRole
from app.models.purchase_order import POLine, PurchaseOrder
from app.models.sales_order import SalesOrder, SOLine
from app.models.sku import SKU, SKUVendor
from app.models.vendor import Vendor
from app.schemas.auth import CurrentUser
from app.services.permissions import PermissionService

# ── Inventory + line sync (shared with fulfillment service) ────
from app.services.fulfillment import (
    _adjust_inventory,
    sum_fulfillment_qty_for_line,
    sync_po_line_status_from_delivered_qty,
)


# ═══════════════════════════════════════════════════════════
#  PO / SO STATUS DERIVATION
# ═══════════════════════════════════════════════════════════

def _line_fully_delivered(line: POLine) -> bool:
    """True when ordered qty is fully delivered (by quantity and status)."""
    if line.quantity <= 0:
        return True
    return (
        line.delivered_qty >= line.quantity
        and line.status == POLineStatus.DELIVERED
    )


def derive_po_status(po: PurchaseOrder) -> POStatus:
    """
    Derive PO header status from its lines.

    • If ALL lines are fully delivered → COMPLETED
    • Otherwise → STARTED
    """
    if not po.lines:
        return POStatus.STARTED

    all_delivered = all(_line_fully_delivered(line) for line in po.lines)
    return POStatus.COMPLETED if all_delivered else POStatus.STARTED


def derive_and_persist_po_status(db: Session, po: PurchaseOrder) -> bool:
    """
    Derive PO status and persist if changed. Returns True if status changed.
    """
    new_status = derive_po_status(po)
    if new_status != po.status:
        po.status = new_status
        return True
    return False


def derive_so_status(db: Session, so_id: int) -> SOStatus:
    """
    Derive SO status from PO lines (delivery progress).

    • No POs → PENDING
    • Any line has delivered_qty > 0 but not every line fully delivered → PARTIALLY_COMPLETED
    • All lines (with qty > 0) fully delivered → COMPLETED
    • POs exist but nothing delivered yet → STARTED
    """
    pos = db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .where(PurchaseOrder.sales_order_id == so_id)
    ).scalars().all()

    if not pos:
        return SOStatus.PENDING

    lines_with_qty = [
        ln for po in pos for ln in (po.lines or []) if ln.quantity > 0
    ]
    if not lines_with_qty:
        return SOStatus.STARTED

    any_delivered = any(ln.delivered_qty > 0 for ln in lines_with_qty)
    all_fully = all(_line_fully_delivered(ln) for ln in lines_with_qty)

    if all_fully:
        return SOStatus.COMPLETED
    if any_delivered:
        return SOStatus.PARTIALLY_COMPLETED
    return SOStatus.STARTED


def derive_and_persist_so_status(db: Session, so_id: int) -> None:
    """Derive SO status from its POs and persist if changed."""
    so = db.execute(
        select(SalesOrder).where(SalesOrder.id == so_id)
    ).scalar_one_or_none()
    if so is None:
        return

    new_status = derive_so_status(db, so_id)
    if new_status != so.status:
        so.status = new_status


# ═══════════════════════════════════════════════════════════
#  PO AUTO-GENERATION
# ═══════════════════════════════════════════════════════════

def generate_pos_from_so(
    db: Session,
    current_user: CurrentUser,
    so_id: int,
    shipment_type: ShipmentType = ShipmentType.DROP_SHIP,
) -> list[PurchaseOrder]:
    """
    Auto-generate Purchase Orders from a Sales Order.

    Steps:
      1. Validate SO exists, has lines, and user has access.
      2. Check no POs already exist for this SO.
      3. For each SO line, resolve the vendor (SKUVendor default → SKU.default_vendor_id).
      4. Group lines by vendor.
      5. Create one PO per vendor with corresponding PO lines.
      6. Update SO status to STARTED.
    """
    # 1. Load SO with lines + SKUs
    so = db.execute(
        select(SalesOrder)
        .options(
            selectinload(SalesOrder.lines).selectinload(SOLine.sku),
            selectinload(SalesOrder.client),
        )
        .where(SalesOrder.id == so_id)
    ).scalar_one_or_none()

    if so is None:
        raise NotFoundException(f"Sales Order with id={so_id} not found")

    PermissionService.assert_can_access_client(current_user, so.client_id)

    # 2. Must have lines
    if not so.lines:
        raise BadRequestException(
            "Cannot generate POs – Sales Order has no line items"
        )

    # 3. Refuse if POs already exist for this SO
    existing_pos = db.execute(
        select(PurchaseOrder.id).where(PurchaseOrder.sales_order_id == so.id)
    ).scalars().all()
    if existing_pos:
        raise ConflictException(
            f"Purchase Orders already exist for SO '{so.order_number}'. "
            f"Delete existing POs first if you need to re-generate."
        )

    # 4. Resolve vendor for each SO line & group by vendor
    #    Also capture vendor_cost per SO line for PO line creation
    vendor_lines: dict[int, list[SOLine]] = defaultdict(list)
    so_line_vendor_cost: dict[int, "Decimal | None"] = {}  # so_line.id → vendor_cost
    unresolved: list[str] = []

    for so_line in so.lines:
        vendor_id, vendor_cost = _resolve_vendor_for_sku(db, so_line.sku_id)
        if vendor_id is None:
            unresolved.append(so_line.sku.sku_code if so_line.sku else f"sku_id={so_line.sku_id}")
        else:
            vendor_lines[vendor_id].append(so_line)
            so_line_vendor_cost[so_line.id] = vendor_cost

    if unresolved:
        raise BadRequestException(
            f"Cannot resolve vendor for SKU(s): {', '.join(unresolved)}. "
            f"Please assign a default vendor to these SKUs first "
            f"(via POST /skus/{{sku_id}}/vendors or set default_vendor_id on the SKU)."
        )

    # 5. Create one PO per vendor
    created_pos: list[PurchaseOrder] = []
    suffix_idx = 0

    for vendor_id, lines in sorted(vendor_lines.items()):
        suffix = chr(ord("A") + suffix_idx)
        po_number = f"PO-{so.order_number}-{suffix}"

        # Uniqueness guard
        dup = db.execute(
            select(PurchaseOrder).where(PurchaseOrder.po_number == po_number)
        ).scalar_one_or_none()
        if dup:
            raise ConflictException(f"PO number '{po_number}' already exists")

        # Validate vendor
        vendor = db.execute(
            select(Vendor).where(Vendor.id == vendor_id)
        ).scalar_one_or_none()
        if vendor is None:
            raise BadRequestException(f"Vendor with id={vendor_id} not found")

        po = PurchaseOrder(
            po_number=po_number,
            sales_order_id=so.id,
            vendor_id=vendor_id,
            shipment_type=shipment_type,
            status=POStatus.STARTED,
        )

        for so_line in lines:
            po.lines.append(
                POLine(
                    so_line_id=so_line.id,
                    sku_id=so_line.sku_id,
                    quantity=so_line.ordered_qty,
                    unit_cost=so_line_vendor_cost.get(so_line.id),
                    due_date=so_line.due_date,
                )
            )

        db.add(po)
        created_pos.append(po)
        suffix_idx += 1

    # 6. Update SO status to STARTED
    so.status = SOStatus.STARTED

    db.commit()
    for po in created_pos:
        db.refresh(po)

    return created_pos


# ═══════════════════════════════════════════════════════════
#  PO CRUD
# ═══════════════════════════════════════════════════════════

def list_purchase_orders(
    db: Session,
    current_user: CurrentUser,
    *,
    sales_order_id: int | None = None,
    vendor_id: int | None = None,
    status: POStatus | None = None,
    shipment_type: ShipmentType | None = None,
    search: str | None = None,
) -> list[PurchaseOrder]:
    """
    Return POs visible to the current user.

    • Admin  → all POs.
    • AM     → POs whose parent SO belongs to an assigned client.
    • Vendor → only their own POs.
    """
    query = (
        select(PurchaseOrder)
        .options(
            selectinload(PurchaseOrder.vendor),
            selectinload(PurchaseOrder.sales_order).selectinload(SalesOrder.client),
            selectinload(PurchaseOrder.sales_order).selectinload(
                SalesOrder.ship_to_address,
            ),
            selectinload(PurchaseOrder.lines),
        )
    )

    # ── Role-based scoping ─────────────────────────────────
    if current_user.role == UserRole.VENDOR:
        query = PermissionService.scope_by_vendor(
            query, current_user, PurchaseOrder.vendor_id,
        )
    elif current_user.role == UserRole.ACCOUNT_MANAGER:
        query = query.join(
            SalesOrder, PurchaseOrder.sales_order_id == SalesOrder.id,
        )
        if not current_user.client_ids:
            query = query.where(SalesOrder.client_id == -1)
        else:
            query = query.where(SalesOrder.client_id.in_(current_user.client_ids))
    # Admin: no filter

    # ── Optional filters ───────────────────────────────────
    if sales_order_id is not None:
        query = query.where(PurchaseOrder.sales_order_id == sales_order_id)
    if vendor_id is not None:
        query = query.where(PurchaseOrder.vendor_id == vendor_id)
    if status is not None:
        query = query.where(PurchaseOrder.status == status)
    if shipment_type is not None:
        query = query.where(PurchaseOrder.shipment_type == shipment_type)
    if search:
        query = query.where(PurchaseOrder.po_number.ilike(f"%{search}%"))

    query = query.order_by(PurchaseOrder.created_at.desc())
    return list(db.execute(query).scalars().unique().all())


def get_purchase_order(
    db: Session,
    current_user: CurrentUser,
    po_id: int,
) -> PurchaseOrder:
    """Fetch a single PO with lines + relationships. Permission-checked."""
    po = db.execute(
        select(PurchaseOrder)
        .options(
            selectinload(PurchaseOrder.vendor),
            selectinload(PurchaseOrder.sales_order).selectinload(SalesOrder.client),
            selectinload(PurchaseOrder.sales_order).selectinload(
                SalesOrder.ship_to_address,
            ),
            selectinload(PurchaseOrder.lines).selectinload(POLine.sku),
        )
        .where(PurchaseOrder.id == po_id)
    ).scalar_one_or_none()

    if po is None:
        raise NotFoundException(f"Purchase Order with id={po_id} not found")

    _assert_can_access_po(current_user, po)
    return po


def update_purchase_order(
    db: Session,
    current_user: CurrentUser,
    po_id: int,
    **kwargs,
) -> PurchaseOrder:
    """
    Update PO fields.

    • shipment_type      – only changeable while not COMPLETED.
    • expected_ship_date / expected_arrival_date – free update.
    • status=COMPLETED  – marks the PO complete: every line gets delivered_qty
      set to full quantity, status DELIVERED, remaining 0 (inventory adjusted).
    """
    po = get_purchase_order(db, current_user, po_id)

    # ── Mark PO complete (all lines delivered) ───────────────
    if kwargs.get("status") is not None:
        if kwargs["status"] != POStatus.COMPLETED:
            raise BadRequestException(
                "PO header status is derived except you may set status to COMPLETED "
                "to close the PO and mark all lines fully delivered."
            )
        if po.status != POStatus.COMPLETED:
            po = db.execute(
                select(PurchaseOrder)
                .options(selectinload(PurchaseOrder.lines))
                .where(PurchaseOrder.id == po_id)
            ).scalar_one()
            for line in po.lines or []:
                old_st = line.status
                old_d = line.delivered_qty

                if po.shipment_type == ShipmentType.IN_HOUSE:
                    if old_st == POLineStatus.READY_FOR_PICKUP:
                        remaining = line.quantity - old_d
                        if remaining > 0:
                            _adjust_inventory(db, line.sku_id, -remaining)
                    elif old_st not in (POLineStatus.READY_FOR_PICKUP, POLineStatus.DELIVERED):
                        pass

                line.delivered_qty = line.quantity
                line.status = POLineStatus.DELIVERED
            db.flush()
            derive_and_persist_po_status(db, po)
            derive_and_persist_so_status(db, po.sales_order_id)

    # ── Vendor reassignment (auto-updates line costs) ──────
    if "vendor_id" in kwargs and kwargs["vendor_id"] is not None:
        new_vendor_id = kwargs["vendor_id"]
        if po.status == POStatus.COMPLETED:
            raise BadRequestException(
                "Cannot change vendor on a COMPLETED PO"
            )
        if new_vendor_id != po.vendor_id:
            new_vendor = db.execute(
                select(Vendor).where(Vendor.id == new_vendor_id)
            ).scalar_one_or_none()
            if new_vendor is None:
                raise BadRequestException(
                    f"Vendor with id={new_vendor_id} not found"
                )
            po.vendor_id = new_vendor_id

            po_with_lines = db.execute(
                select(PurchaseOrder)
                .options(selectinload(PurchaseOrder.lines))
                .where(PurchaseOrder.id == po.id)
            ).scalar_one()
            for line in po_with_lines.lines or []:
                sv = db.execute(
                    select(SKUVendor).where(
                        SKUVendor.sku_id == line.sku_id,
                        SKUVendor.vendor_id == new_vendor_id,
                    )
                ).scalar_one_or_none()
                line.unit_cost = sv.vendor_cost if sv else None

    # ── Shipment type change ───────────────────────────────
    if "shipment_type" in kwargs and kwargs["shipment_type"] is not None:
        if po.status == POStatus.COMPLETED:
            raise BadRequestException(
                "Cannot change shipment type on a COMPLETED PO"
            )
        po.shipment_type = kwargs["shipment_type"]

    # ── Date updates ───────────────────────────────────────
    if "expected_ship_date" in kwargs:
        po.expected_ship_date = kwargs["expected_ship_date"]
    if "expected_arrival_date" in kwargs:
        po.expected_arrival_date = kwargs["expected_arrival_date"]

    db.commit()
    db.refresh(po)
    return po


def update_po_line(
    db: Session,
    current_user: CurrentUser,
    po_id: int,
    line_id: int,
    **kwargs,
) -> POLine:
    """
    Update per-line fields on a PO line (status, dates).

    Per-line status follows a fixed flow:
      Drop-ship: IN_PRODUCTION → PACKED_AND_SHIPPED → DELIVERED
      In-house:  IN_PRODUCTION → PACKED_AND_SHIPPED → READY_FOR_PICKUP → DELIVERED

    When a line reaches DELIVERED, the PO header status is auto-derived.
    When PO status changes, the parent SO status is also auto-derived.
    """
    po = get_purchase_order(db, current_user, po_id)

    line = db.execute(
        select(POLine).where(
            POLine.id == line_id,
            POLine.purchase_order_id == po.id,
        )
    ).scalar_one_or_none()

    if line is None:
        raise NotFoundException(
            f"PO Line id={line_id} not found on PO {po.po_number}"
        )

    # ── Per-line delivered quantity (vendor / admin) ──────
    if "delivered_qty" in kwargs and kwargs["delivered_qty"] is not None:
        new_d = kwargs["delivered_qty"]
        if new_d < 0:
            raise BadRequestException("delivered_qty cannot be negative")
        if new_d > line.quantity:
            raise BadRequestException(
                f"delivered_qty ({new_d}) cannot exceed line quantity ({line.quantity})"
            )
        events_sum = sum_fulfillment_qty_for_line(db, line.id)
        if new_d < events_sum:
            raise BadRequestException(
                f"delivered_qty ({new_d}) cannot be less than recorded fulfillment "
                f"events total ({events_sum})"
            )
        old_st = line.status
        old_d = line.delivered_qty
        delta = new_d - old_d
        if delta:
            if po.shipment_type == ShipmentType.IN_HOUSE:
                _adjust_inventory(db, line.sku_id, -delta)
            line.delivered_qty = new_d
            sync_po_line_status_from_delivered_qty(
                db,
                line,
                prev_status=old_st,
                prev_delivered=old_d,
            )

    # ── Per-line status transition ────────────────────────
    if "status" in kwargs and kwargs["status"] is not None:
        new_status = kwargs["status"]
        if new_status != line.status:
            _validate_line_status_transition(
                po.shipment_type, line.status, new_status,
            )

            if (
                po.shipment_type == ShipmentType.IN_HOUSE
                and new_status == POLineStatus.DELIVERED
                and current_user.role != UserRole.ADMIN
            ):
                raise ForbiddenException(
                    "Only an Admin can mark in-house PO lines as Delivered. "
                    "The vendor marks Ready for Pickup, then an Admin confirms Delivered."
                )

            old_status = line.status

            # In-house inventory: +qty when goods arrive at warehouse
            if (
                po.shipment_type == ShipmentType.IN_HOUSE
                and new_status == POLineStatus.READY_FOR_PICKUP
            ):
                _adjust_inventory(db, line.sku_id, +line.quantity)

            # In-house inventory: when admin marks DELIVERED, subtract
            # whatever is still in the warehouse (qty − already delivered).
            if (
                po.shipment_type == ShipmentType.IN_HOUSE
                and new_status == POLineStatus.DELIVERED
                and old_status == POLineStatus.READY_FOR_PICKUP
            ):
                remaining = line.quantity - line.delivered_qty
                if remaining > 0:
                    _adjust_inventory(db, line.sku_id, -remaining)

            if new_status == POLineStatus.DELIVERED and line.delivered_qty < line.quantity:
                line.delivered_qty = line.quantity

            line.status = new_status

    if "due_date" in kwargs:
        line.due_date = kwargs["due_date"]
    if "expected_ship_date" in kwargs:
        line.expected_ship_date = kwargs["expected_ship_date"]
    if "expected_arrival_date" in kwargs:
        line.expected_arrival_date = kwargs["expected_arrival_date"]

    # ── Auto-derive PO header status ──────────────────────
    # Reload PO lines to get fresh state
    db.flush()
    po = db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .where(PurchaseOrder.id == po_id)
    ).scalar_one()
    derive_and_persist_po_status(db, po)
    derive_and_persist_so_status(db, po.sales_order_id)

    db.commit()
    db.refresh(line)
    return line


def delete_purchase_order(
    db: Session,
    current_user: CurrentUser,
    po_id: int,
) -> None:
    """
    Hard-delete a PO.  Only allowed when status is STARTED.
    After deletion, re-derives the parent SO status.
    """
    po = get_purchase_order(db, current_user, po_id)

    if po.status == POStatus.COMPLETED:
        raise BadRequestException(
            "Cannot delete a COMPLETED PO."
        )

    so_id = po.sales_order_id
    db.delete(po)
    db.flush()

    # Re-derive SO status after PO deletion
    derive_and_persist_so_status(db, so_id)

    db.commit()


# ═══════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════

def _resolve_vendor_for_sku(db: Session, sku_id: int) -> tuple[int | None, "Decimal | None"]:
    """
    Find the vendor that should supply a given SKU, plus the vendor cost.

    Returns (vendor_id, vendor_cost) – either or both can be None.

    Resolution order:
      1. sku_vendors row with is_default = True  → use that vendor_id + vendor_cost.
      2. SKU.default_vendor_id                   → use that (vendor_cost from sku_vendors if exists).
      3. Any sku_vendors row (first found)       → fallback.
      4. (None, None)                            → cannot auto-generate.
    """
    from decimal import Decimal  # local to avoid circular import at module level

    # 1. Explicit default in sku_vendors
    default_sv = db.execute(
        select(SKUVendor).where(
            SKUVendor.sku_id == sku_id,
            SKUVendor.is_default == True,  # noqa: E712
        )
    ).scalar_one_or_none()
    if default_sv is not None:
        return default_sv.vendor_id, default_sv.vendor_cost

    # 2. SKU.default_vendor_id
    sku = db.execute(
        select(SKU).where(SKU.id == sku_id)
    ).scalar_one_or_none()
    if sku and sku.default_vendor_id:
        # Try to find vendor_cost from sku_vendors for this vendor
        sv = db.execute(
            select(SKUVendor).where(
                SKUVendor.sku_id == sku_id,
                SKUVendor.vendor_id == sku.default_vendor_id,
            )
        ).scalar_one_or_none()
        cost = sv.vendor_cost if sv else None
        return sku.default_vendor_id, cost

    # 3. First linked vendor (non-default fallback)
    any_sv = db.execute(
        select(SKUVendor)
        .where(SKUVendor.sku_id == sku_id)
        .limit(1)
    ).scalar_one_or_none()
    if any_sv is not None:
        return any_sv.vendor_id, any_sv.vendor_cost

    return None, None


# ── Valid LINE-level status transitions (mirrors PO-level) ──
_VALID_LINE_TRANSITIONS: dict[tuple[ShipmentType, POLineStatus], list[POLineStatus]] = {
    # Drop-ship flow
    (ShipmentType.DROP_SHIP, POLineStatus.IN_PRODUCTION): [POLineStatus.PACKED_AND_SHIPPED],
    (ShipmentType.DROP_SHIP, POLineStatus.PACKED_AND_SHIPPED): [POLineStatus.DELIVERED],
    # In-house flow
    (ShipmentType.IN_HOUSE, POLineStatus.IN_PRODUCTION): [POLineStatus.PACKED_AND_SHIPPED],
    (ShipmentType.IN_HOUSE, POLineStatus.PACKED_AND_SHIPPED): [POLineStatus.READY_FOR_PICKUP],
    (ShipmentType.IN_HOUSE, POLineStatus.READY_FOR_PICKUP): [POLineStatus.DELIVERED],
}


def _validate_line_status_transition(
    shipment_type: ShipmentType,
    current_status: POLineStatus,
    new_status: POLineStatus,
) -> None:
    """Validate that the requested PO line status transition is allowed."""
    key = (shipment_type, current_status)
    valid_next = _VALID_LINE_TRANSITIONS.get(key, [])

    if new_status not in valid_next:
        flow = "Drop-Ship" if shipment_type == ShipmentType.DROP_SHIP else "In-House"
        valid_str = ", ".join(s.value for s in valid_next) if valid_next else "none (terminal state)"
        raise BadRequestException(
            f"Invalid line status transition for {flow} flow: "
            f"'{current_status.value}' -> '{new_status.value}'. "
            f"Valid next: [{valid_str}]"
        )


def _assert_can_access_po(
    current_user: CurrentUser,
    po: PurchaseOrder,
) -> None:
    """
    Check that the current user can access a specific PO.

    • Admin  → always OK.
    • AM     → SO's client must be in their assigned clients.
    • Vendor → PO's vendor must match their vendor_id.
    """
    if current_user.role == UserRole.ADMIN:
        return

    if current_user.role == UserRole.ACCOUNT_MANAGER:
        if po.sales_order and po.sales_order.client_id in current_user.client_ids:
            return
        raise ForbiddenException("You do not have access to this Purchase Order")

    if current_user.role == UserRole.VENDOR:
        if current_user.vendor_id == po.vendor_id:
            return
        raise ForbiddenException("You can only access your own Purchase Orders")

    raise ForbiddenException("Access denied")
