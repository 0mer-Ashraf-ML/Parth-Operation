"""
Purchase Order service – auto-generation from SO and CRUD.

Key business rules:
  • POs are auto-generated from a Sales Order – ONE PO per vendor.
    Example: SO has 5 lines, 3 go to Vendor A and 2 to Vendor B
             → PO-{SO}-A  (3 lines)
             → PO-{SO}-B  (2 lines)
  • Vendor is resolved per SKU from sku_vendors (default) → SKU.default_vendor_id.
  • PO status follows a fixed flow depending on shipment type:
      Drop-ship:  IN_PRODUCTION → PACKED_AND_SHIPPED → DELIVERED
      In-house:   IN_PRODUCTION → PACKED_AND_SHIPPED → READY_FOR_PICKUP → DELIVERED
  • Vendors can only see and update their own POs.
  • AMs can see POs whose parent SO belongs to their assigned clients.
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
from app.models.enums import POStatus, ShipmentType, UserRole
from app.models.purchase_order import POLine, PurchaseOrder
from app.models.sales_order import SOLine, SalesOrder
from app.models.sku import SKU, SKUVendor
from app.models.vendor import Vendor
from app.schemas.auth import CurrentUser
from app.services.permissions import PermissionService


# ── Valid status transitions per shipment type ─────────────
_VALID_TRANSITIONS: dict[tuple[ShipmentType, POStatus], list[POStatus]] = {
    # Drop-ship flow
    (ShipmentType.DROP_SHIP, POStatus.IN_PRODUCTION): [POStatus.PACKED_AND_SHIPPED],
    (ShipmentType.DROP_SHIP, POStatus.PACKED_AND_SHIPPED): [POStatus.DELIVERED],
    # In-house flow
    (ShipmentType.IN_HOUSE, POStatus.IN_PRODUCTION): [POStatus.PACKED_AND_SHIPPED],
    (ShipmentType.IN_HOUSE, POStatus.PACKED_AND_SHIPPED): [POStatus.READY_FOR_PICKUP],
    (ShipmentType.IN_HOUSE, POStatus.READY_FOR_PICKUP): [POStatus.DELIVERED],
}


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
    vendor_lines: dict[int, list[SOLine]] = defaultdict(list)
    unresolved: list[str] = []

    for so_line in so.lines:
        vendor_id = _resolve_vendor_for_sku(db, so_line.sku_id)
        if vendor_id is None:
            unresolved.append(so_line.sku.sku_code if so_line.sku else f"sku_id={so_line.sku_id}")
        else:
            vendor_lines[vendor_id].append(so_line)

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
            status=POStatus.IN_PRODUCTION,
        )

        for so_line in lines:
            po.lines.append(
                POLine(
                    so_line_id=so_line.id,
                    sku_id=so_line.sku_id,
                    quantity=so_line.ordered_qty,
                    due_date=so_line.due_date,
                )
            )

        db.add(po)
        created_pos.append(po)
        suffix_idx += 1

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

    • status             – validated against the shipment-type flow.
    • shipment_type      – only changeable while IN_PRODUCTION.
    • expected_ship_date – free update.
    • expected_arrival_date – free update.
    """
    po = get_purchase_order(db, current_user, po_id)

    # ── Status transition ──────────────────────────────────
    if "status" in kwargs and kwargs["status"] is not None:
        new_status = kwargs["status"]
        if new_status != po.status:
            _validate_status_transition(po.shipment_type, po.status, new_status)
            po.status = new_status

    # ── Shipment type change ───────────────────────────────
    if "shipment_type" in kwargs and kwargs["shipment_type"] is not None:
        if po.status != POStatus.IN_PRODUCTION:
            raise BadRequestException(
                f"Cannot change shipment type once PO is in "
                f"'{po.status.value}' status"
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
    """Update per-line dates on a PO line (vendor schedule tracking)."""
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

    if "due_date" in kwargs:
        line.due_date = kwargs["due_date"]
    if "expected_ship_date" in kwargs:
        line.expected_ship_date = kwargs["expected_ship_date"]
    if "expected_arrival_date" in kwargs:
        line.expected_arrival_date = kwargs["expected_arrival_date"]

    db.commit()
    db.refresh(line)
    return line


def delete_purchase_order(
    db: Session,
    current_user: CurrentUser,
    po_id: int,
) -> None:
    """
    Hard-delete a PO.  Only allowed when status is IN_PRODUCTION.
    """
    po = get_purchase_order(db, current_user, po_id)

    if po.status != POStatus.IN_PRODUCTION:
        raise BadRequestException(
            f"Cannot delete PO in '{po.status.value}' status. "
            f"Only IN_PRODUCTION POs can be deleted."
        )

    db.delete(po)
    db.commit()


# ═══════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════

def _resolve_vendor_for_sku(db: Session, sku_id: int) -> int | None:
    """
    Find the vendor that should supply a given SKU.

    Resolution order:
      1. sku_vendors row with is_default = True  → use that vendor_id.
      2. SKU.default_vendor_id                   → use that.
      3. Any sku_vendors row (first found)       → fallback.
      4. None                                    → cannot auto-generate.
    """
    # 1. Explicit default in sku_vendors
    default_sv = db.execute(
        select(SKUVendor).where(
            SKUVendor.sku_id == sku_id,
            SKUVendor.is_default == True,  # noqa: E712
        )
    ).scalar_one_or_none()
    if default_sv is not None:
        return default_sv.vendor_id

    # 2. SKU.default_vendor_id
    sku = db.execute(
        select(SKU).where(SKU.id == sku_id)
    ).scalar_one_or_none()
    if sku and sku.default_vendor_id:
        return sku.default_vendor_id

    # 3. First linked vendor (non-default fallback)
    any_sv = db.execute(
        select(SKUVendor)
        .where(SKUVendor.sku_id == sku_id)
        .limit(1)
    ).scalar_one_or_none()
    if any_sv is not None:
        return any_sv.vendor_id

    return None


def _validate_status_transition(
    shipment_type: ShipmentType,
    current_status: POStatus,
    new_status: POStatus,
) -> None:
    """Validate that the requested status transition is allowed."""
    key = (shipment_type, current_status)
    valid_next = _VALID_TRANSITIONS.get(key, [])

    if new_status not in valid_next:
        flow = "Drop-Ship" if shipment_type == ShipmentType.DROP_SHIP else "In-House"
        valid_str = ", ".join(s.value for s in valid_next) if valid_next else "none (terminal state)"
        raise BadRequestException(
            f"Invalid status transition for {flow} flow: "
            f"'{current_status.value}' → '{new_status.value}'. "
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
