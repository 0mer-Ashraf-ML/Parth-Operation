"""
SKU routes – CRUD for SKUs, Tier Pricing, and SKU-Vendor mapping.

Permission matrix:
    Action             │ Admin │ AM  │ Vendor
    ───────────────────┼───────┼─────┼───────
    List / Get SKUs    │  ✓    │  ✓  │  ✓
    Create / Update    │  ✓    │  ✗  │  ✗
    Delete (soft)      │  ✓    │  ✗  │  ✗
    Tier pricing CRUD  │  ✓    │  ✗  │  ✗
    SKU-Vendor mapping │  ✓    │  ✗  │  ✗
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_admin, require_any_role
from app.schemas.auth import CurrentUser
from app.models.enums import UserRole
from app.schemas.sku import (
    SKUCreate,
    SKUDetailOut,
    SKUListOut,
    SKUUpdate,
    SKUVendorCreate,
    SKUVendorOut,
    SKUVendorUpdate,
    TierPricingCreate,
    TierPricingOut,
    TierPricingUpdate,
    SKUOrderVolumeOut
)
from app.services import sku as sku_svc

router = APIRouter(prefix="/skus", tags=["SKUs"])


# ═══════════════════════════════════════════════════════════
#  SKU ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.get(
    "",
    summary="List SKUs",
)
def list_skus(
    is_active: bool | None = Query(True, description="Filter by active status"),
    search: str | None = Query(None, description="Search by SKU code or name"),
    vendor_id: int | None = Query(None, description="Filter by default vendor"),
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    skus = sku_svc.list_skus(
        db, is_active=is_active, search=search, vendor_id=vendor_id,
    )
    return {
        "success": True,
        "data": [SKUListOut.model_validate(s) for s in skus],
    }


@router.get(
    "/{sku_id}",
    summary="Get SKU details with tier prices and vendor mappings",
)
def get_sku(
    sku_id: int,
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    sku = sku_svc.get_sku(db, sku_id)
    detail = _sku_to_detail(sku, hide_tier_pricing=(current_user.role == UserRole.VENDOR))
    return {"success": True, "data": detail}


@router.get(
    "/{sku_id}/volume",
    summary="Get SKU order volume analytics over a date range",
    response_model=dict,
)
def get_sku_volume(
    sku_id: int,
    date_from: str = Query(..., description="Start date (YYYY-MM-DD)"),
    date_to: str = Query(..., description="End date (YYYY-MM-DD)"),
    current_user: CurrentUser = Depends(require_admin), # Usually analytics is restricted
    db: Session = Depends(get_db),
):
    """
    Computes total order volume for a SKU within the specified date range 
    using PO line data.
    """
    volume_data = sku_svc.get_sku_order_volume(db, sku_id, date_from, date_to)
    return {
        "success": True, 
        "data": SKUOrderVolumeOut.model_validate(volume_data)
    }


@router.post(
    "",
    summary="Create a new SKU",
    status_code=201,
)
def create_sku(
    body: SKUCreate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    sku = sku_svc.create_sku(db, body)
    sku = sku_svc.get_sku(db, sku.id)  # reload with relationships
    detail = _sku_to_detail(sku)
    return {"success": True, "data": detail}


@router.patch(
    "/{sku_id}",
    summary="Update a SKU",
)
def update_sku(
    sku_id: int,
    body: SKUUpdate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    sku = sku_svc.update_sku(db, sku_id, body)
    sku = sku_svc.get_sku(db, sku.id)
    detail = _sku_to_detail(sku)
    return {"success": True, "data": detail}


@router.delete(
    "/{sku_id}",
    summary="Soft-delete a SKU (deactivate)",
)
def delete_sku(
    sku_id: int,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    sku_svc.delete_sku(db, sku_id)
    return {"success": True, "data": {"message": "SKU deactivated"}}


# ═══════════════════════════════════════════════════════════
#  TIER PRICING ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.post(
    "/{sku_id}/tiers",
    summary="Add a tier price to a SKU",
    status_code=201,
)
def add_tier_price(
    sku_id: int,
    body: TierPricingCreate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    tier = sku_svc.add_tier_price(db, sku_id, body)
    return {
        "success": True,
        "data": TierPricingOut.model_validate(tier),
    }


@router.patch(
    "/{sku_id}/tiers/{tier_id}",
    summary="Update a tier price",
)
def update_tier_price(
    sku_id: int,
    tier_id: int,
    body: TierPricingUpdate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    tier = sku_svc.update_tier_price(db, sku_id, tier_id, body)
    return {
        "success": True,
        "data": TierPricingOut.model_validate(tier),
    }


@router.delete(
    "/{sku_id}/tiers/{tier_id}",
    summary="Delete a tier price",
)
def delete_tier_price(
    sku_id: int,
    tier_id: int,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    sku_svc.delete_tier_price(db, sku_id, tier_id)
    return {"success": True, "data": {"message": "Tier price deleted"}}


@router.put(
    "/{sku_id}/tiers",
    summary="Replace all tier prices for a SKU",
)
def replace_tier_prices(
    sku_id: int,
    body: list[TierPricingCreate],
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    tiers = sku_svc.replace_tier_prices(db, sku_id, body)
    return {
        "success": True,
        "data": [TierPricingOut.model_validate(t) for t in tiers],
    }


# ═══════════════════════════════════════════════════════════
#  SKU ↔ VENDOR MAPPING ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.get(
    "/{sku_id}/vendors",
    summary="List vendors linked to a SKU",
)
def list_sku_vendors(
    sku_id: int,
    current_user: CurrentUser = Depends(require_any_role),
    db: Session = Depends(get_db),
):
    mappings = sku_svc.list_sku_vendors(db, sku_id)
    return {
        "success": True,
        "data": [
            SKUVendorOut(
                id=m.id,
                sku_id=m.sku_id,
                vendor_id=m.vendor_id,
                is_default=m.is_default,
                vendor_cost=m.vendor_cost,
                vendor_name=m.vendor.company_name if m.vendor else None,
            )
            for m in mappings
        ],
    }


@router.post(
    "/{sku_id}/vendors",
    summary="Link a vendor to a SKU (with optional vendor cost)",
    status_code=201,
)
def add_sku_vendor(
    sku_id: int,
    body: SKUVendorCreate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    sv = sku_svc.add_sku_vendor(db, sku_id, body)
    # Reload with vendor relationship for vendor_name
    mappings = sku_svc.list_sku_vendors(db, sku_id)
    sv_out = next((m for m in mappings if m.vendor_id == body.vendor_id), sv)
    return {
        "success": True,
        "data": SKUVendorOut(
            id=sv_out.id,
            sku_id=sv_out.sku_id,
            vendor_id=sv_out.vendor_id,
            is_default=sv_out.is_default,
            vendor_cost=sv_out.vendor_cost,
            vendor_name=sv_out.vendor.company_name if sv_out.vendor else None,
        ),
    }


@router.patch(
    "/{sku_id}/vendors/{vendor_id}",
    summary="Update a SKU-Vendor mapping (vendor cost, default flag)",
)
def update_sku_vendor(
    sku_id: int,
    vendor_id: int,
    body: SKUVendorUpdate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    sv = sku_svc.update_sku_vendor(db, sku_id, vendor_id, body)
    return {
        "success": True,
        "data": SKUVendorOut(
            id=sv.id,
            sku_id=sv.sku_id,
            vendor_id=sv.vendor_id,
            is_default=sv.is_default,
            vendor_cost=sv.vendor_cost,
            vendor_name=sv.vendor.company_name if sv.vendor else None,
        ),
    }


@router.delete(
    "/{sku_id}/vendors/{vendor_id}",
    summary="Unlink a vendor from a SKU",
)
def remove_sku_vendor(
    sku_id: int,
    vendor_id: int,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    sku_svc.remove_sku_vendor(db, sku_id, vendor_id)
    return {"success": True, "data": {"message": "Vendor unlinked from SKU"}}


# ── Helper ─────────────────────────────────────────────────

def _sku_to_detail(sku, *, hide_tier_pricing: bool = False) -> SKUDetailOut:
    """
    Build the detail response, enriching SKUVendor rows with vendor_name.

    hide_tier_pricing: if True, tier_prices list is returned empty.
      Used for Vendor-role responses – vendors must never see our client pricing.
    """
    vendor_outs = []
    for sv in sku.sku_vendors:
        vendor_outs.append(
            SKUVendorOut(
                id=sv.id,
                sku_id=sv.sku_id,
                vendor_id=sv.vendor_id,
                is_default=sv.is_default,
                vendor_cost=sv.vendor_cost,
                vendor_name=sv.vendor.company_name if sv.vendor else None,
            )
        )

    return SKUDetailOut(
        id=sku.id,
        sku_code=sku.sku_code,
        name=sku.name,
        description=sku.description,
        default_vendor_id=sku.default_vendor_id,
        secondary_vendor_id=sku.secondary_vendor_id,
        track_inventory=sku.track_inventory,
        inventory_count=sku.inventory_count,
        is_active=sku.is_active,
        created_at=sku.created_at,
        updated_at=sku.updated_at,
        tier_prices=(
            [] if hide_tier_pricing
            else [TierPricingOut.model_validate(tp) for tp in sku.tier_prices]
        ),
        sku_vendors=vendor_outs,
    )
