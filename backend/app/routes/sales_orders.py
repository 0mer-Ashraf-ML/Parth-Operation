"""
Sales Order routes – CRUD for Sales Orders and SO Line management.

Sales Orders track INVOICING only – no delivery data.
All delivery/shipment tracking lives on Purchase Order lines.

Permission matrix:
    Action              │ Admin │ AM          │ Vendor
    ────────────────────┼───────┼─────────────┼───────
    List SOs            │  ✓    │  ✓ (scoped) │  ✗
    Get SO detail       │  ✓    │  ✓ (scoped) │  ✗
    Create SO           │  ✓    │  ✓ (scoped) │  ✗
    Update SO           │  ✓    │  ✓ (scoped) │  ✗
    Delete SO           │  ✓    │  ✗          │  ✗
    Add/Update/Delete   │  ✓    │  ✓ (scoped) │  ✗
    SO lines            │       │             │

    "scoped" = AM sees/manages only SOs for their assigned clients.
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import require_admin, require_admin_or_am
from app.models.enums import SOStatus
from app.models.sales_order import SOLine
from app.schemas.auth import CurrentUser
from app.schemas.sales_order import (
    SOCreate,
    SODetailOut,
    SOLineCreate,
    SOLineOut,
    SOLineUpdate,
    SOListOut,
    SOUpdate,
)
from app.services import sales_order as so_svc

router = APIRouter(prefix="/sales-orders", tags=["Sales Orders"])


# ═══════════════════════════════════════════════════════════
#  SALES ORDER ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.get(
    "",
    summary="List Sales Orders",
    response_description="Array of Sales Orders visible to the caller",
)
def list_sales_orders(
    client_id: int | None = Query(None, description="Filter by client"),
    status: SOStatus | None = Query(None, description="Filter by SO status"),
    search: str | None = Query(None, description="Search by order number"),
    current_user: CurrentUser = Depends(require_admin_or_am),
    db: Session = Depends(get_db),
):
    orders = so_svc.list_sales_orders(
        db, current_user,
        client_id=client_id, status=status, search=search,
    )
    return {
        "success": True,
        "data": [_so_to_list_item(so) for so in orders],
    }


@router.get(
    "/{so_id}",
    summary="Get Sales Order details with line items",
)
def get_sales_order(
    so_id: int,
    current_user: CurrentUser = Depends(require_admin_or_am),
    db: Session = Depends(get_db),
):
    so = so_svc.get_sales_order(db, current_user, so_id)
    return {
        "success": True,
        "data": _so_to_detail(so),
    }


@router.post(
    "",
    summary="Create a new Sales Order (with optional line items)",
    response_description="The newly created Sales Order with lines",
    status_code=201,
)
def create_sales_order(
    body: SOCreate,
    current_user: CurrentUser = Depends(require_admin_or_am),
    db: Session = Depends(get_db),
):
    so = so_svc.create_sales_order(db, current_user, body)
    # Re-fetch with all relationships for a complete response
    so = so_svc.get_sales_order(db, current_user, so.id)
    return {
        "success": True,
        "data": _so_to_detail(so),
    }


@router.patch(
    "/{so_id}",
    summary="Update a Sales Order (header fields only)",
)
def update_sales_order(
    so_id: int,
    body: SOUpdate,
    current_user: CurrentUser = Depends(require_admin_or_am),
    db: Session = Depends(get_db),
):
    so = so_svc.update_sales_order(db, current_user, so_id, body)
    so = so_svc.get_sales_order(db, current_user, so.id)
    return {
        "success": True,
        "data": _so_to_detail(so),
    }


@router.delete(
    "/{so_id}",
    summary="Delete a Sales Order (only PENDING with no POs)",
)
def delete_sales_order(
    so_id: int,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    so_svc.delete_sales_order(db, current_user, so_id)
    return {"success": True, "data": {"message": "Sales Order deleted"}}


# ═══════════════════════════════════════════════════════════
#  SO LINE ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.post(
    "/{so_id}/lines",
    summary="Add a line item to a Sales Order",
    status_code=201,
)
def add_so_line(
    so_id: int,
    body: SOLineCreate,
    current_user: CurrentUser = Depends(require_admin_or_am),
    db: Session = Depends(get_db),
):
    line = so_svc.add_so_line(db, current_user, so_id, body)
    # Reload with SKU relationship for a complete response
    line = _load_line_with_sku(db, line.id)
    return {
        "success": True,
        "data": _line_to_out(line),
    }


@router.patch(
    "/{so_id}/lines/{line_id}",
    summary="Update an SO line item (ordered_qty, due_date)",
)
def update_so_line(
    so_id: int,
    line_id: int,
    body: SOLineUpdate,
    current_user: CurrentUser = Depends(require_admin_or_am),
    db: Session = Depends(get_db),
):
    line = so_svc.update_so_line(db, current_user, so_id, line_id, body)
    line = _load_line_with_sku(db, line.id)
    return {
        "success": True,
        "data": _line_to_out(line),
    }


@router.delete(
    "/{so_id}/lines/{line_id}",
    summary="Remove a line item (only if no POs reference it)",
)
def delete_so_line(
    so_id: int,
    line_id: int,
    current_user: CurrentUser = Depends(require_admin_or_am),
    db: Session = Depends(get_db),
):
    so_svc.delete_so_line(db, current_user, so_id, line_id)
    return {"success": True, "data": {"message": "SO Line deleted"}}


# ═══════════════════════════════════════════════════════════
#  RESPONSE BUILDERS
# ═══════════════════════════════════════════════════════════

def _so_to_list_item(so) -> dict:
    """Build the lightweight list-item representation of a Sales Order."""
    line_count = len(so.lines) if so.lines else 0
    total_amount = sum(
        (Decimal(ln.ordered_qty) * ln.unit_price for ln in so.lines),
        Decimal("0.00"),
    ) if so.lines else Decimal("0.00")

    return SOListOut(
        id=so.id,
        order_number=so.order_number,
        client_id=so.client_id,
        client_name=so.client.company_name if so.client else None,
        status=so.status,
        order_date=so.order_date,
        due_date=so.due_date,
        line_count=line_count,
        total_amount=total_amount,
        created_at=so.created_at,
    ).model_dump()


def _so_to_detail(so) -> dict:
    """Build the full detail representation of a Sales Order with lines."""
    lines = sorted(so.lines, key=lambda ln: ln.line_number) if so.lines else []
    has_pos = bool(so.purchase_orders) if hasattr(so, "purchase_orders") else False
    is_deletable = (so.status == SOStatus.PENDING) and not has_pos

    return SODetailOut(
        id=so.id,
        order_number=so.order_number,
        client_id=so.client_id,
        client_name=so.client.company_name if so.client else None,
        ship_to_address_id=so.ship_to_address_id,
        status=so.status,
        order_date=so.order_date,
        due_date=so.due_date,
        original_pdf_url=so.original_pdf_url,
        notes=so.notes,
        created_by=so.created_by,
        creator_name=so.creator.full_name if hasattr(so, "creator") and so.creator else None,
        is_deletable=is_deletable,
        created_at=so.created_at,
        updated_at=so.updated_at,
        lines=[_line_to_out(ln) for ln in lines],
    ).model_dump()


def _line_to_out(line) -> dict:
    """Build the response representation of a single SO line (invoicing only)."""
    return SOLineOut(
        id=line.id,
        sales_order_id=line.sales_order_id,
        sku_id=line.sku_id,
        line_number=line.line_number,
        ordered_qty=line.ordered_qty,
        unit_price=line.unit_price,
        due_date=line.due_date,
        invoiced_qty=line.invoiced_qty,
        uninvoiced_qty=line.uninvoiced_qty,
        sku_code=line.sku.sku_code if line.sku else None,
        sku_name=line.sku.name if line.sku else None,
    ).model_dump()


def _load_line_with_sku(db: Session, line_id: int) -> SOLine:
    """Reload an SOLine with its SKU relationship eagerly loaded."""
    return db.execute(
        select(SOLine)
        .options(selectinload(SOLine.sku))
        .where(SOLine.id == line_id)
    ).scalar_one()
