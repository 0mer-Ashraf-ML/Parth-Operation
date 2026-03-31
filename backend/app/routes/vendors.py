"""
Vendor routes – CRUD for Vendor records and VendorAddress management.

Permission matrix:
    Action              │ Admin │ AM  │ Vendor
    ────────────────────┼───────┼─────┼───────
    List vendors        │  ✓    │  ✓  │  ✓ (own only)
    Get vendor          │  ✓    │  ✓  │  ✓ (own only)
    Create vendor       │  ✓    │  ✗  │  ✗
    Update vendor       │  ✓    │  ✗  │  ✗
    Delete vendor       │  ✓    │  ✗  │  ✗
    Add address         │  ✓    │  ✗  │  ✗
    Update address      │  ✓    │  ✗  │  ✗
    Delete address      │  ✓    │  ✗  │  ✗
    Vendor clients      │  ✓    │  ✓  │  ✓ (own only)
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_admin, require_any_role
from app.schemas.auth import CurrentUser
from app.schemas.vendor import (
    VendorAddressCreate,
    VendorAddressOut,
    VendorAddressUpdate,
    VendorCreate,
    VendorDetailOut,
    VendorListOut,
    VendorUpdate,
)
from app.services import vendor as vendor_svc

router = APIRouter(prefix="/vendors", tags=["Vendors"])


# ═══════════════════════════════════════════════════════════
#  VENDOR CRUD
# ═══════════════════════════════════════════════════════════

@router.get(
    "",
    summary="List vendors",
)
def list_vendors(
    is_active: bool | None = Query(None, description="Filter by active status"),
    search: str | None = Query(None, description="Search by company name"),
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    vendors = vendor_svc.list_vendors(
        db, current_user, is_active=is_active, search=search,
    )
    return {
        "success": True,
        "data": [VendorDetailOut.model_validate(v) for v in vendors],
    }


@router.get(
    "/{vendor_id}",
    summary="Get vendor details (with addresses)",
)
def get_vendor(
    vendor_id: int,
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    vendor = vendor_svc.get_vendor(db, current_user, vendor_id)
    return {
        "success": True,
        "data": VendorDetailOut.model_validate(vendor),
    }


@router.post(
    "",
    summary="Create a new vendor (with optional addresses)",
    status_code=201,
)
def create_vendor(
    body: VendorCreate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    vendor = vendor_svc.create_vendor(db, body)
    return {
        "success": True,
        "data": VendorDetailOut.model_validate(vendor),
    }


@router.patch(
    "/{vendor_id}",
    summary="Update a vendor",
)
def update_vendor(
    vendor_id: int,
    body: VendorUpdate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    vendor = vendor_svc.update_vendor(db, current_user, vendor_id, body)
    return {
        "success": True,
        "data": VendorDetailOut.model_validate(vendor),
    }


@router.delete(
    "/{vendor_id}",
    summary="Soft-delete a vendor (deactivate)",
)
def delete_vendor(
    vendor_id: int,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    vendor_svc.delete_vendor(db, current_user, vendor_id)
    return {"success": True, "data": {"message": "Vendor deactivated"}}


# ═══════════════════════════════════════════════════════════
#  VENDOR ADDRESS CRUD
# ═══════════════════════════════════════════════════════════

@router.post(
    "/{vendor_id}/addresses",
    summary="Add an address to a vendor",
    status_code=201,
)
def add_vendor_address(
    vendor_id: int,
    body: VendorAddressCreate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    address = vendor_svc.add_vendor_address(db, current_user, vendor_id, body)
    return {
        "success": True,
        "data": VendorAddressOut.model_validate(address),
    }


@router.patch(
    "/{vendor_id}/addresses/{address_id}",
    summary="Update a vendor address",
)
def update_vendor_address(
    vendor_id: int,
    address_id: int,
    body: VendorAddressUpdate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    address = vendor_svc.update_vendor_address(
        db, current_user, vendor_id, address_id, body,
    )
    return {
        "success": True,
        "data": VendorAddressOut.model_validate(address),
    }


@router.delete(
    "/{vendor_id}/addresses/{address_id}",
    summary="Delete a vendor address",
)
def delete_vendor_address(
    vendor_id: int,
    address_id: int,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    vendor_svc.delete_vendor_address(db, current_user, vendor_id, address_id)
    return {"success": True, "data": {"message": "Vendor address deleted"}}


# ═══════════════════════════════════════════════════════════
#  VENDOR → CLIENT RELATIONSHIP (G)
# ═══════════════════════════════════════════════════════════

@router.get(
    "/{vendor_id}/clients",
    summary="Show clients where this vendor is default or secondary",
)
def get_vendor_clients(
    vendor_id: int,
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    """
    Returns clients where this vendor is either the default or secondary
    vendor for at least one SKU.  Useful for vendor to see who they serve.
    """
    vendor = vendor_svc.get_vendor(db, current_user, vendor_id)
    clients = _get_clients_for_vendor(db, vendor_id)
    return {
        "success": True,
        "data": clients,
    }


def _get_clients_for_vendor(db: Session, vendor_id: int) -> list[dict]:
    """
    Find all clients where this vendor is the default or secondary vendor
    for at least one SKU used in that client's Sales Orders.

    Also includes clients whose SKUs directly list this vendor in sku_vendors.
    """
    from sqlalchemy import select, distinct, case, literal_column, union_all
    from app.models.sku import SKU, SKUVendor
    from app.models.client import Client
    from app.models.sales_order import SalesOrder, SOLine

    # Method 1: SKUs where vendor is in sku_vendors
    # and those SKUs appear in SO lines → find the client
    stmt_via_so = (
        select(
            Client.id.label("client_id"),
            Client.company_name.label("company_name"),
            SKU.sku_code.label("sku_code"),
            SKU.name.label("sku_name"),
            case(
                (SKU.default_vendor_id == vendor_id, "default"),
                (SKU.secondary_vendor_id == vendor_id, "secondary"),
                else_="linked",
            ).label("relationship"),
        )
        .select_from(SKUVendor)
        .join(SKU, SKU.id == SKUVendor.sku_id)
        .join(SOLine, SOLine.sku_id == SKU.id)
        .join(SalesOrder, SalesOrder.id == SOLine.sales_order_id)
        .join(Client, Client.id == SalesOrder.client_id)
        .where(SKUVendor.vendor_id == vendor_id)
        .distinct()
    )

    # Method 2: SKUs where vendor is default or secondary (regardless of SO)
    stmt_via_sku = (
        select(
            literal_column("NULL").label("client_id"),
            literal_column("NULL").label("company_name"),
            SKU.sku_code.label("sku_code"),
            SKU.name.label("sku_name"),
            case(
                (SKU.default_vendor_id == vendor_id, "default"),
                (SKU.secondary_vendor_id == vendor_id, "secondary"),
                else_="linked",
            ).label("relationship"),
        )
        .select_from(SKUVendor)
        .join(SKU, SKU.id == SKUVendor.sku_id)
        .where(SKUVendor.vendor_id == vendor_id)
        .distinct()
    )

    # Build result by combining both perspectives
    # Primary: clients connected via SO lines
    rows_so = db.execute(stmt_via_so).all()

    # Group by client
    client_map: dict[int, dict] = {}
    for row in rows_so:
        cid = row.client_id
        if cid not in client_map:
            client_map[cid] = {
                "client_id": cid,
                "company_name": row.company_name,
                "skus": [],
            }
        client_map[cid]["skus"].append({
            "sku_code": row.sku_code,
            "sku_name": row.sku_name,
            "relationship": row.relationship,
        })

    # Also include SKUs not yet in any SO (for completeness)
    rows_sku = db.execute(stmt_via_sku).all()
    sku_only: list[dict] = []
    known_sku_codes = set()
    for cm in client_map.values():
        for s in cm["skus"]:
            known_sku_codes.add(s["sku_code"])

    for row in rows_sku:
        if row.sku_code not in known_sku_codes:
            sku_only.append({
                "sku_code": row.sku_code,
                "sku_name": row.sku_name,
                "relationship": row.relationship,
            })
            known_sku_codes.add(row.sku_code)

    return {
        "clients": list(client_map.values()),
        "unassigned_skus": sku_only,
    }
