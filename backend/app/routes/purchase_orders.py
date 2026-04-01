"""
Purchase Order routes – PO auto-generation, CRUD, and line management.

PO lines now carry ALL delivery tracking: per-line status,
delivered_qty, remaining_qty, plus schedule dates.

Permission matrix:
    Action              │ Admin │ AM          │ Vendor
    ────────────────────┼───────┼─────────────┼───────
    Generate POs from SO│  ✓    │  ✓ (scoped) │  ✗
    List POs            │  ✓    │  ✓ (scoped) │  ✓ (own)
    Get PO detail       │  ✓    │  ✓ (scoped) │  ✓ (own)
    Update PO           │  ✓    │  ✓ (scoped) │  ✓ (own)
    Delete PO           │  ✓    │  ✗          │  ✗
    Update PO line      │  ✓    │  ✓ (scoped) │  ✓ (own)

    "scoped" = AM sees POs for their assigned clients (via SO → client).
    "own"    = Vendor sees only POs addressed to their vendor record.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import require_admin, require_admin_or_am, require_any_role
from app.models.enums import POStatus, ShipmentType
from app.models.purchase_order import POLine
from app.schemas.auth import CurrentUser
from app.schemas.client import ClientAddressOut
from app.schemas.purchase_order import (
    PODetailOut,
    POGenerateRequest,
    POLineOut,
    POLineUpdate,
    POListOut,
    POUpdate,
)
from app.services import purchase_order as po_svc

# ── Main PO router (/purchase-orders/*) ───────────────────
router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])

# ── Generate router (POST /sales-orders/{so_id}/generate-pos) ─
generate_router = APIRouter(tags=["Purchase Orders"])


# ═══════════════════════════════════════════════════════════
#  PO GENERATION (lives under /sales-orders)
# ═══════════════════════════════════════════════════════════

@generate_router.post(
    "/sales-orders/{so_id}/generate-pos",
    summary="Auto-generate Purchase Orders from a Sales Order",
    response_description="List of generated POs (one per vendor)",
    status_code=201,
)
def generate_pos(
    so_id: int,
    body: POGenerateRequest = POGenerateRequest(),
    current_user: CurrentUser = Depends(require_admin_or_am),
    db: Session = Depends(get_db),
):
    pos = po_svc.generate_pos_from_so(
        db, current_user, so_id, shipment_type=body.shipment_type,
    )
    # Re-fetch each PO with full relationships
    result = []
    for po in pos:
        full_po = po_svc.get_purchase_order(db, current_user, po.id)
        result.append(_po_to_detail(full_po))

    return {
        "success": True,
        "data": {
            "message": f"{len(pos)} Purchase Order(s) generated",
            "purchase_orders": result,
        },
    }


# ═══════════════════════════════════════════════════════════
#  PO CRUD ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.get(
    "",
    summary="List Purchase Orders",
    response_description="POs visible to the caller (role-scoped)",
)
def list_purchase_orders(
    sales_order_id: int | None = Query(None, description="Filter by SO"),
    vendor_id: int | None = Query(None, description="Filter by vendor"),
    status: POStatus | None = Query(None, description="Filter by PO status"),
    shipment_type: ShipmentType | None = Query(None, description="Filter by shipment type"),
    search: str | None = Query(None, description="Search by PO number"),
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    pos = po_svc.list_purchase_orders(
        db, current_user,
        sales_order_id=sales_order_id,
        vendor_id=vendor_id,
        status=status,
        shipment_type=shipment_type,
        search=search,
    )
    return {
        "success": True,
        "data": [_po_to_list_item(po) for po in pos],
    }


@router.get(
    "/{po_id}",
    summary="Get Purchase Order details with line items",
)
def get_purchase_order(
    po_id: int,
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    po = po_svc.get_purchase_order(db, current_user, po_id)
    return {
        "success": True,
        "data": _po_to_detail(po),
    }


@router.patch(
    "/{po_id}",
    summary="Update PO (status, shipment type, dates)",
)
def update_purchase_order(
    po_id: int,
    body: POUpdate,
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    update_data = body.model_dump(exclude_unset=True)
    po = po_svc.update_purchase_order(db, current_user, po_id, **update_data)
    po = po_svc.get_purchase_order(db, current_user, po.id)
    return {
        "success": True,
        "data": _po_to_detail(po),
    }


@router.delete(
    "/{po_id}",
    summary="Delete a PO (only if STARTED)",
)
def delete_purchase_order(
    po_id: int,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    po_svc.delete_purchase_order(db, current_user, po_id)
    return {"success": True, "data": {"message": "Purchase Order deleted"}}


# ═══════════════════════════════════════════════════════════
#  PO LINE ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.patch(
    "/{po_id}/lines/{line_id}",
    summary="Update PO line (status, dates – vendor schedule tracking)",
)
def update_po_line(
    po_id: int,
    line_id: int,
    body: POLineUpdate,
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    update_data = body.model_dump(exclude_unset=True)
    line = po_svc.update_po_line(db, current_user, po_id, line_id, **update_data)
    line = _load_line_with_sku(db, line.id)
    return {
        "success": True,
        "data": _line_to_out(line),
    }


# ═══════════════════════════════════════════════════════════
#  RESPONSE BUILDERS
# ═══════════════════════════════════════════════════════════

def _so_ship_to_fields(po) -> tuple[Optional[ClientAddressOut], Optional[str]]:
    """Ship-to address + contact from parent SO (for vendor drop-ship context)."""
    so = po.sales_order
    if so is None:
        return None, None
    addr = (
        ClientAddressOut.model_validate(so.ship_to_address)
        if so.ship_to_address is not None
        else None
    )
    contact = so.ship_to_contact_name
    return addr, contact


def _po_to_list_item(po) -> dict:
    """Build lightweight list-item representation of a PO."""
    line_count = len(po.lines) if po.lines else 0
    total_quantity = sum(ln.quantity for ln in po.lines) if po.lines else 0
    total_delivered = sum(ln.delivered_qty for ln in po.lines) if po.lines else 0
    total_cost = _calc_total_cost(po.lines) if po.lines else None
    ship_addr, ship_contact = _so_ship_to_fields(po)

    return POListOut(
        id=po.id,
        po_number=po.po_number,
        sales_order_id=po.sales_order_id,
        so_order_number=po.sales_order.order_number if po.sales_order else None,
        vendor_id=po.vendor_id,
        vendor_name=po.vendor.company_name if po.vendor else None,
        client_name=(
            po.sales_order.client.company_name
            if po.sales_order and po.sales_order.client else None
        ),
        shipment_type=po.shipment_type,
        status=po.status,
        ship_to_address=ship_addr,
        ship_to_contact_name=ship_contact,
        expected_ship_date=po.expected_ship_date,
        expected_arrival_date=po.expected_arrival_date,
        completed_at=po.completed_at,
        line_count=line_count,
        total_quantity=total_quantity,
        total_delivered=total_delivered,
        total_cost=total_cost,
        created_at=po.created_at,
    ).model_dump()


def _po_to_detail(po) -> dict:
    """Build full detail representation of a PO with lines."""
    lines = [_line_to_out(ln) for ln in po.lines] if po.lines else []
    is_deletable = po.status == POStatus.STARTED
    total_quantity = sum(ln.quantity for ln in po.lines) if po.lines else 0
    total_delivered = sum(ln.delivered_qty for ln in po.lines) if po.lines else 0
    total_cost = _calc_total_cost(po.lines) if po.lines else None
    ship_addr, ship_contact = _so_ship_to_fields(po)

    return PODetailOut(
        id=po.id,
        po_number=po.po_number,
        sales_order_id=po.sales_order_id,
        so_order_number=po.sales_order.order_number if po.sales_order else None,
        vendor_id=po.vendor_id,
        vendor_name=po.vendor.company_name if po.vendor else None,
        client_name=(
            po.sales_order.client.company_name
            if po.sales_order and po.sales_order.client else None
        ),
        shipment_type=po.shipment_type,
        status=po.status,
        ship_to_address=ship_addr,
        ship_to_contact_name=ship_contact,
        expected_ship_date=po.expected_ship_date,
        expected_arrival_date=po.expected_arrival_date,
        completed_at=po.completed_at,
        total_quantity=total_quantity,
        total_delivered=total_delivered,
        total_cost=total_cost,
        is_deletable=is_deletable,
        created_at=po.created_at,
        updated_at=po.updated_at,
        lines=lines,
    ).model_dump()


def _line_to_out(line) -> dict:
    """Build response representation of a single PO line (with delivery + cost data)."""
    from decimal import Decimal

    unit_cost = line.unit_cost
    line_total = (unit_cost * line.quantity) if unit_cost is not None else None

    return POLineOut(
        id=line.id,
        purchase_order_id=line.purchase_order_id,
        so_line_id=line.so_line_id,
        sku_id=line.sku_id,
        quantity=line.quantity,
        unit_cost=unit_cost,
        line_total=line_total,
        status=line.status,
        delivered_qty=line.delivered_qty,
        remaining_qty=line.remaining_qty,
        is_fully_delivered=line.delivered_qty >= line.quantity,
        delivered_at=line.delivered_at,
        received_at=line.received_at,
        due_date=line.due_date,
        expected_ship_date=line.expected_ship_date,
        expected_arrival_date=line.expected_arrival_date,
        created_at=line.created_at,
        sku_code=line.sku.sku_code if line.sku else None,
        sku_name=line.sku.name if line.sku else None,
    ).model_dump()


def _calc_total_cost(lines) -> "Decimal | None":
    """Sum unit_cost × quantity across all lines (None if no costs set)."""
    from decimal import Decimal

    total = Decimal("0")
    any_cost = False
    for ln in lines:
        if ln.unit_cost is not None:
            total += ln.unit_cost * ln.quantity
            any_cost = True
    return total if any_cost else None


def _load_line_with_sku(db: Session, line_id: int) -> POLine:
    """Reload a POLine with its SKU relationship."""
    return db.execute(
        select(POLine)
        .options(selectinload(POLine.sku))
        .where(POLine.id == line_id)
    ).scalar_one()
