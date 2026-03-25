"""
Sales Order service – business logic for SO CRUD and line management.

Key business rules:
  • SO tracks INVOICING only – no delivery data.
  • All delivery tracking lives on PO lines.
  • Unit price is locked at SO line creation from tier pricing.
  • AM can only create/access SOs for assigned clients.
  • Vendor cannot access SOs (they see POs instead).
  • SO status is auto-derived from PO completion:
      PENDING → STARTED → PARTIALLY_COMPLETED → COMPLETED
  • payment_status is separate: NOT_INVOICED → PARTIALLY_INVOICED → FULLY_PAID (M2).
  • Order-level due_date has been removed.  Due dates live on SO lines only.
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.exceptions import (
    BadRequestException,
    ConflictException,
    NotFoundException,
)
from app.models.client import Client, ClientAddress
from app.models.enums import SOPaymentStatus, SOStatus
from app.models.sales_order import SalesOrder, SOLine
from app.models.sku import SKU
from app.schemas.auth import CurrentUser
from app.schemas.sales_order import SOCreate, SOLineCreate, SOLineUpdate, SOUpdate
from app.services.permissions import PermissionService
from app.services.sku import resolve_tier_price


# ═══════════════════════════════════════════════════════════
#  SALES ORDER CRUD
# ═══════════════════════════════════════════════════════════

def list_sales_orders(
    db: Session,
    current_user: CurrentUser,
    *,
    client_id: int | None = None,
    status: SOStatus | None = None,
    search: str | None = None,
) -> list[SalesOrder]:
    """
    Return Sales Orders visible to the current user.

    • Admin → all SOs.
    • AM    → only SOs for assigned clients.
    • Vendor → forbidden (raised by PermissionService.scope_by_client).
    """
    query = (
        select(SalesOrder)
        .options(
            selectinload(SalesOrder.client),
            selectinload(SalesOrder.lines),
        )
    )
    query = PermissionService.scope_by_client(
        query, current_user, SalesOrder.client_id,
    )

    if client_id is not None:
        query = query.where(SalesOrder.client_id == client_id)
    if status is not None:
        query = query.where(SalesOrder.status == status)
    if search:
        query = query.where(SalesOrder.order_number.ilike(f"%{search}%"))

    query = query.order_by(SalesOrder.created_at.desc())
    return list(db.execute(query).scalars().unique().all())


def get_sales_order(
    db: Session,
    current_user: CurrentUser,
    so_id: int,
) -> SalesOrder:
    """
    Fetch a single SO with lines (+ their SKUs) and creator eagerly loaded.
    Raises NotFoundException if not found, ForbiddenException if not accessible.
    """
    so = db.execute(
        select(SalesOrder)
        .options(
            selectinload(SalesOrder.client),
            selectinload(SalesOrder.lines).selectinload(SOLine.sku),
            selectinload(SalesOrder.creator),
        )
        .where(SalesOrder.id == so_id)
    ).scalar_one_or_none()

    if so is None:
        raise NotFoundException(f"Sales Order with id={so_id} not found")

    PermissionService.assert_can_access_client(current_user, so.client_id)
    return so


def create_sales_order(
    db: Session,
    current_user: CurrentUser,
    data: SOCreate,
) -> SalesOrder:
    """
    Create a Sales Order with optional nested lines.

    Business rules:
      1. Client must exist, be active, and caller must have access.
      2. Ship-to address (if provided) must belong to the client.
      3. order_number must be unique.
      4. For each line, unit_price is auto-resolved from tier pricing
         if not explicitly provided.
      5. Status is set to PENDING.
      6. payment_status defaults to NOT_INVOICED.
    """
    # 1. Validate client
    client = db.execute(
        select(Client).where(Client.id == data.client_id)
    ).scalar_one_or_none()
    if client is None:
        raise BadRequestException(f"Client with id={data.client_id} not found")
    if not client.is_active:
        raise BadRequestException(
            f"Client '{client.company_name}' is inactive – cannot create Sales Order"
        )
    PermissionService.assert_can_access_client(current_user, data.client_id)

    # 2. Unique order_number
    existing = db.execute(
        select(SalesOrder).where(SalesOrder.order_number == data.order_number)
    ).scalar_one_or_none()
    if existing:
        raise ConflictException(
            f"Sales Order with number '{data.order_number}' already exists"
        )

    # 3. Validate ship-to address belongs to this client
    if data.ship_to_address_id is not None:
        addr = db.execute(
            select(ClientAddress).where(
                ClientAddress.id == data.ship_to_address_id,
                ClientAddress.client_id == data.client_id,
            )
        ).scalar_one_or_none()
        if addr is None:
            raise BadRequestException(
                f"Address id={data.ship_to_address_id} not found or "
                f"does not belong to client id={data.client_id}"
            )

    # 4. Build SO header (no order-level due_date)
    so = SalesOrder(
        order_number=data.order_number,
        client_id=data.client_id,
        ship_to_address_id=data.ship_to_address_id,
        order_date=data.order_date,
        original_pdf_url=data.original_pdf_url,
        notes=data.notes,
        status=SOStatus.PENDING,
        payment_status=SOPaymentStatus.NOT_INVOICED,
        created_by=current_user.user_id,
    )

    # 5. Build lines with tier-price resolution
    used_line_numbers: set[int] = set()
    for idx, line_data in enumerate(data.lines, start=1):
        sku = _validate_sku(db, line_data.sku_id)
        unit_price = _resolve_line_price(db, sku, line_data)
        line_number = line_data.line_number or idx

        if line_number in used_line_numbers:
            raise ConflictException(
                f"Duplicate line_number {line_number} in the request"
            )
        used_line_numbers.add(line_number)

        so.lines.append(
            SOLine(
                sku_id=sku.id,
                line_number=line_number,
                ordered_qty=line_data.ordered_qty,
                unit_price=unit_price,
                due_date=line_data.due_date,
            )
        )

    db.add(so)
    db.commit()
    db.refresh(so)
    return so


def update_sales_order(
    db: Session,
    current_user: CurrentUser,
    so_id: int,
    data: SOUpdate,
) -> SalesOrder:
    """Partial-update SO header fields.  Admin or AM (if assigned client)."""
    so = get_sales_order(db, current_user, so_id)
    update_data = data.model_dump(exclude_unset=True)

    # Validate unique order_number if changing
    if "order_number" in update_data and update_data["order_number"] != so.order_number:
        dup = db.execute(
            select(SalesOrder).where(
                SalesOrder.order_number == update_data["order_number"]
            )
        ).scalar_one_or_none()
        if dup:
            raise ConflictException(
                f"Sales Order with number '{update_data['order_number']}' already exists"
            )

    # Validate ship_to_address if changing
    new_addr_id = update_data.get("ship_to_address_id")
    if new_addr_id is not None:
        addr = db.execute(
            select(ClientAddress).where(
                ClientAddress.id == new_addr_id,
                ClientAddress.client_id == so.client_id,
            )
        ).scalar_one_or_none()
        if addr is None:
            raise BadRequestException(
                f"Address id={new_addr_id} not found or "
                f"does not belong to client id={so.client_id}"
            )

    for field, value in update_data.items():
        setattr(so, field, value)

    db.commit()
    db.refresh(so)
    return so


def delete_sales_order(
    db: Session,
    current_user: CurrentUser,
    so_id: int,
) -> None:
    """
    Hard-delete a Sales Order.  Only allowed when:
      • Status is PENDING
      • No Purchase Orders have been generated for it
    """
    so = get_sales_order(db, current_user, so_id)

    if so.status != SOStatus.PENDING:
        raise BadRequestException(
            f"Cannot delete SO in '{so.status.value}' status. "
            f"Only PENDING orders can be deleted."
        )

    # Check if POs exist for this SO
    if so.purchase_orders:
        raise BadRequestException(
            "Cannot delete SO with existing Purchase Orders. "
            "Delete the POs first."
        )

    db.delete(so)
    db.commit()


# ═══════════════════════════════════════════════════════════
#  SO LINE MANAGEMENT
# ═══════════════════════════════════════════════════════════

def add_so_line(
    db: Session,
    current_user: CurrentUser,
    so_id: int,
    data: SOLineCreate,
) -> SOLine:
    """Add a new line item to an existing Sales Order."""
    so = get_sales_order(db, current_user, so_id)

    # Validate SKU
    sku = _validate_sku(db, data.sku_id)

    # Auto-assign line_number if not provided
    line_number = data.line_number
    if line_number is None:
        max_ln = max((ln.line_number for ln in so.lines), default=0)
        line_number = max_ln + 1
    else:
        # Check for duplicate line_number
        if any(ln.line_number == line_number for ln in so.lines):
            raise ConflictException(
                f"Line number {line_number} already exists on SO {so.order_number}"
            )

    unit_price = _resolve_line_price(db, sku, data)

    line = SOLine(
        sales_order_id=so.id,
        sku_id=sku.id,
        line_number=line_number,
        ordered_qty=data.ordered_qty,
        unit_price=unit_price,
        due_date=data.due_date,
    )
    db.add(line)
    db.commit()
    db.refresh(line)
    return line


def update_so_line(
    db: Session,
    current_user: CurrentUser,
    so_id: int,
    line_id: int,
    data: SOLineUpdate,
) -> SOLine:
    """
    Update an SO line.

    Allowed changes:
      • ordered_qty  – any positive value
      • due_date     – any date
    unit_price is locked at creation and cannot be changed.
    """
    so = get_sales_order(db, current_user, so_id)

    line = db.execute(
        select(SOLine).where(
            SOLine.id == line_id,
            SOLine.sales_order_id == so.id,
        )
    ).scalar_one_or_none()
    if line is None:
        raise NotFoundException(
            f"SO Line id={line_id} not found on SO {so.order_number}"
        )

    update_data = data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(line, field, value)

    db.commit()
    db.refresh(line)
    return line


def delete_so_line(
    db: Session,
    current_user: CurrentUser,
    so_id: int,
    line_id: int,
) -> None:
    """Remove a line from an SO.  Only if no POs reference it."""
    so = get_sales_order(db, current_user, so_id)

    line = db.execute(
        select(SOLine).where(
            SOLine.id == line_id,
            SOLine.sales_order_id == so.id,
        )
    ).scalar_one_or_none()
    if line is None:
        raise NotFoundException(
            f"SO Line id={line_id} not found on SO {so.order_number}"
        )

    # Check if any PO lines reference this SO line
    from app.models.purchase_order import POLine
    po_line_count = db.execute(
        select(POLine.id).where(POLine.so_line_id == line.id)
    ).scalars().all()
    if po_line_count:
        raise BadRequestException(
            f"Cannot delete SO line – it is referenced by {len(po_line_count)} PO line(s). "
            f"Delete the associated POs first."
        )

    db.delete(line)
    db.commit()


# ═══════════════════════════════════════════════════════════
#  INTERNAL HELPERS
# ═══════════════════════════════════════════════════════════

def _validate_sku(db: Session, sku_id: int) -> SKU:
    """Fetch a SKU and ensure it exists and is active."""
    sku = db.execute(
        select(SKU).where(SKU.id == sku_id)
    ).scalar_one_or_none()
    if sku is None:
        raise BadRequestException(f"SKU with id={sku_id} not found")
    if not sku.is_active:
        raise BadRequestException(
            f"SKU '{sku.sku_code}' is inactive and cannot be added to a Sales Order"
        )
    return sku


def _resolve_line_price(
    db: Session,
    sku: SKU,
    line_data: SOLineCreate,
) -> Decimal:
    """
    Determine the unit price for an SO line:
      1. If unit_price is explicitly provided → use it.
      2. Otherwise, auto-resolve from tier pricing for the SKU + qty.
      3. If no tier pricing configured and no price given → error.
    """
    if line_data.unit_price is not None:
        return line_data.unit_price

    tier = resolve_tier_price(db, sku.id, line_data.ordered_qty)
    if tier is None:
        raise BadRequestException(
            f"No tier pricing found for SKU '{sku.sku_code}' at qty "
            f"{line_data.ordered_qty}. Please provide unit_price explicitly."
        )
    return tier.unit_price
