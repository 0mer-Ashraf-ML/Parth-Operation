"""
Vendor routes – CRUD for Vendor records.

Permission matrix:
    Action         │ Admin │ AM  │ Vendor
    ───────────────┼───────┼─────┼───────
    List vendors   │  ✓    │  ✓  │  ✓ (own only)
    Get vendor     │  ✓    │  ✓  │  ✓ (own only)
    Create vendor  │  ✓    │  ✗  │  ✗
    Update vendor  │  ✓    │  ✗  │  ✗
    Delete vendor  │  ✓    │  ✗  │  ✗
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_admin, require_any_role
from app.schemas.auth import CurrentUser
from app.schemas.vendor import (
    VendorCreate,
    VendorDetailOut,
    VendorListOut,
    VendorUpdate,
)
from app.services import vendor as vendor_svc

router = APIRouter(prefix="/vendors", tags=["Vendors"])


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
        "data": [VendorListOut.model_validate(v) for v in vendors],
    }


@router.get(
    "/{vendor_id}",
    summary="Get vendor details",
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
    summary="Create a new vendor",
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
