"""
SKU service – business logic for SKU, TierPricing, and SKUVendor.

Key business rules:
  • sku_code must be unique.
  • Tier prices cannot have overlapping qty ranges for the same SKU.
  • When a SKU has tier_prices, the system auto-selects the correct
    unit_price at SO-line creation time and locks it in.
  • SKUVendor maps vendors that can supply a given SKU.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.exceptions import (
    BadRequestException,
    ConflictException,
    NotFoundException,
)
from app.models.sku import SKU, SKUVendor, TierPricing
from app.models.vendor import Vendor
from app.schemas.sku import (
    SKUCreate,
    SKUUpdate,
    SKUVendorCreate,
    SKUVendorUpdate,
    TierPricingCreate,
    TierPricingUpdate,
)


# ═══════════════════════════════════════════════════════════
#  SKU CRUD
# ═══════════════════════════════════════════════════════════

def list_skus(
    db: Session,
    *,
    is_active: bool | None = None,
    search: str | None = None,
    vendor_id: int | None = None,
) -> list[SKU]:
    """
    Return all SKUs, optionally filtered by active status, search term,
    or vendor.
    """
    query = select(SKU)

    if is_active is not None:
        query = query.where(SKU.is_active == is_active)
    if search:
        query = query.where(
            SKU.sku_code.ilike(f"%{search}%") | SKU.name.ilike(f"%{search}%")
        )
    if vendor_id is not None:
        query = query.where(SKU.default_vendor_id == vendor_id)

    query = query.order_by(SKU.sku_code)
    return list(db.execute(query).scalars().all())


def get_sku(db: Session, sku_id: int) -> SKU:
    """Fetch a single SKU with tier prices and vendor mappings loaded."""
    sku = db.execute(
        select(SKU)
        .options(
            selectinload(SKU.tier_prices),
            selectinload(SKU.sku_vendors).selectinload(SKUVendor.vendor),
        )
        .where(SKU.id == sku_id)
    ).scalar_one_or_none()

    if sku is None:
        raise NotFoundException(f"SKU with id={sku_id} not found")
    return sku


def create_sku(db: Session, data: SKUCreate) -> SKU:
    """
    Create a new SKU with optional nested tier prices.
    Only Admins (enforced at route level).
    """
    # Unique sku_code check
    existing = db.execute(
        select(SKU).where(SKU.sku_code == data.sku_code)
    ).scalar_one_or_none()
    if existing:
        raise ConflictException(f"A SKU with code '{data.sku_code}' already exists")

    # Validate default vendor exists
    if data.default_vendor_id is not None:
        vendor = db.execute(
            select(Vendor).where(Vendor.id == data.default_vendor_id)
        ).scalar_one_or_none()
        if vendor is None:
            raise BadRequestException(f"Vendor with id={data.default_vendor_id} not found")

    # Validate secondary vendor exists
    if data.secondary_vendor_id is not None:
        sec_vendor = db.execute(
            select(Vendor).where(Vendor.id == data.secondary_vendor_id)
        ).scalar_one_or_none()
        if sec_vendor is None:
            raise BadRequestException(f"Vendor with id={data.secondary_vendor_id} not found")
        if data.secondary_vendor_id == data.default_vendor_id:
            raise BadRequestException("Secondary vendor cannot be the same as the default vendor")

    sku = SKU(
        sku_code=data.sku_code,
        name=data.name,
        description=data.description,
        default_vendor_id=data.default_vendor_id,
        secondary_vendor_id=data.secondary_vendor_id,
        track_inventory=data.track_inventory,
        inventory_count=data.inventory_count,
    )

    # Nested tier prices
    for tp in data.tier_prices:
        sku.tier_prices.append(
            TierPricing(
                min_qty=tp.min_qty,
                max_qty=tp.max_qty,
                unit_price=tp.unit_price,
            )
        )

    db.add(sku)
    db.commit()
    db.refresh(sku)
    return sku


def update_sku(db: Session, sku_id: int, data: SKUUpdate) -> SKU:
    """Partial-update a SKU.  Only Admins."""
    sku = get_sku(db, sku_id)

    update_data = data.model_dump(exclude_unset=True)

    # Validate unique sku_code if changing
    if "sku_code" in update_data and update_data["sku_code"] != sku.sku_code:
        existing = db.execute(
            select(SKU).where(SKU.sku_code == update_data["sku_code"])
        ).scalar_one_or_none()
        if existing:
            raise ConflictException(f"A SKU with code '{update_data['sku_code']}' already exists")

    # Validate vendor if changing
    if "default_vendor_id" in update_data and update_data["default_vendor_id"] is not None:
        vendor = db.execute(
            select(Vendor).where(Vendor.id == update_data["default_vendor_id"])
        ).scalar_one_or_none()
        if vendor is None:
            raise BadRequestException(
                f"Vendor with id={update_data['default_vendor_id']} not found"
            )

    # Validate secondary vendor if changing
    if "secondary_vendor_id" in update_data and update_data["secondary_vendor_id"] is not None:
        sec_vendor = db.execute(
            select(Vendor).where(Vendor.id == update_data["secondary_vendor_id"])
        ).scalar_one_or_none()
        if sec_vendor is None:
            raise BadRequestException(
                f"Vendor with id={update_data['secondary_vendor_id']} not found"
            )
        # Check not same as default
        effective_default = update_data.get("default_vendor_id", sku.default_vendor_id)
        if update_data["secondary_vendor_id"] == effective_default:
            raise BadRequestException("Secondary vendor cannot be the same as the default vendor")

    for field, value in update_data.items():
        setattr(sku, field, value)

    db.commit()
    db.refresh(sku)
    return sku


def delete_sku(db: Session, sku_id: int) -> None:
    """Soft-delete a SKU (set is_active=False).  Only Admins."""
    sku = get_sku(db, sku_id)
    sku.is_active = False
    db.commit()


# ═══════════════════════════════════════════════════════════
#  TIER PRICING CRUD
# ═══════════════════════════════════════════════════════════

def add_tier_price(db: Session, sku_id: int, data: TierPricingCreate) -> TierPricing:
    """Add a new tier price row to a SKU."""
    # Ensure SKU exists
    sku = get_sku(db, sku_id)

    tier = TierPricing(
        sku_id=sku.id,
        min_qty=data.min_qty,
        max_qty=data.max_qty,
        unit_price=data.unit_price,
    )
    db.add(tier)
    db.commit()
    db.refresh(tier)
    return tier


def update_tier_price(
    db: Session, sku_id: int, tier_id: int, data: TierPricingUpdate,
) -> TierPricing:
    """Update an existing tier price row."""
    tier = db.execute(
        select(TierPricing).where(
            TierPricing.id == tier_id,
            TierPricing.sku_id == sku_id,
        )
    ).scalar_one_or_none()

    if tier is None:
        raise NotFoundException(f"Tier pricing with id={tier_id} not found on SKU {sku_id}")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tier, field, value)

    db.commit()
    db.refresh(tier)
    return tier


def delete_tier_price(db: Session, sku_id: int, tier_id: int) -> None:
    """Hard-delete a tier price row."""
    tier = db.execute(
        select(TierPricing).where(
            TierPricing.id == tier_id,
            TierPricing.sku_id == sku_id,
        )
    ).scalar_one_or_none()

    if tier is None:
        raise NotFoundException(f"Tier pricing with id={tier_id} not found on SKU {sku_id}")

    db.delete(tier)
    db.commit()


def replace_tier_prices(
    db: Session, sku_id: int, tiers: list[TierPricingCreate],
) -> list[TierPricing]:
    """
    Replace ALL tier prices for a SKU in one operation.
    Deletes existing tiers and creates the new ones.
    """
    sku = get_sku(db, sku_id)

    # Delete existing tiers
    db.execute(
        select(TierPricing).where(TierPricing.sku_id == sku.id)
    )
    for existing in sku.tier_prices:
        db.delete(existing)

    # Create new tiers
    new_tiers = []
    for tp in tiers:
        tier = TierPricing(
            sku_id=sku.id,
            min_qty=tp.min_qty,
            max_qty=tp.max_qty,
            unit_price=tp.unit_price,
        )
        db.add(tier)
        new_tiers.append(tier)

    db.commit()
    for t in new_tiers:
        db.refresh(t)
    return new_tiers


# ═══════════════════════════════════════════════════════════
#  SKU ↔ VENDOR MAPPING
# ═══════════════════════════════════════════════════════════

def add_sku_vendor(db: Session, sku_id: int, data: SKUVendorCreate) -> SKUVendor:
    """Link a vendor to a SKU."""
    sku = get_sku(db, sku_id)

    # Validate vendor exists
    vendor = db.execute(
        select(Vendor).where(Vendor.id == data.vendor_id)
    ).scalar_one_or_none()
    if vendor is None:
        raise BadRequestException(f"Vendor with id={data.vendor_id} not found")

    # Check for duplicate
    existing = db.execute(
        select(SKUVendor).where(
            SKUVendor.sku_id == sku.id,
            SKUVendor.vendor_id == data.vendor_id,
        )
    ).scalar_one_or_none()
    if existing:
        raise ConflictException(
            f"Vendor {data.vendor_id} is already linked to SKU {sku.sku_code}"
        )

    # If marking as default, un-default others
    if data.is_default:
        _clear_default_sku_vendor(db, sku.id)

    sv = SKUVendor(
        sku_id=sku.id,
        vendor_id=data.vendor_id,
        is_default=data.is_default,
        vendor_cost=data.vendor_cost,
    )
    db.add(sv)
    db.commit()
    db.refresh(sv)
    return sv


def update_sku_vendor(
    db: Session, sku_id: int, vendor_id: int, data: SKUVendorUpdate,
) -> SKUVendor:
    """Update a SKU-Vendor mapping (vendor_cost, is_default)."""
    sv = db.execute(
        select(SKUVendor)
        .options(selectinload(SKUVendor.vendor))
        .where(
            SKUVendor.sku_id == sku_id,
            SKUVendor.vendor_id == vendor_id,
        )
    ).scalar_one_or_none()

    if sv is None:
        raise NotFoundException(
            f"Vendor {vendor_id} is not linked to SKU {sku_id}"
        )

    update_data = data.model_dump(exclude_unset=True)

    # If marking as default, un-default others first
    if update_data.get("is_default"):
        _clear_default_sku_vendor(db, sku_id)

    for field, value in update_data.items():
        setattr(sv, field, value)

    db.commit()
    db.refresh(sv)
    return sv


def remove_sku_vendor(db: Session, sku_id: int, vendor_id: int) -> None:
    """Remove a vendor from a SKU."""
    sv = db.execute(
        select(SKUVendor).where(
            SKUVendor.sku_id == sku_id,
            SKUVendor.vendor_id == vendor_id,
        )
    ).scalar_one_or_none()

    if sv is None:
        raise NotFoundException(
            f"Vendor {vendor_id} is not linked to SKU {sku_id}"
        )

    db.delete(sv)
    db.commit()


def list_sku_vendors(db: Session, sku_id: int) -> list[SKUVendor]:
    """List all vendor mappings for a SKU."""
    get_sku(db, sku_id)  # ensures SKU exists
    return list(
        db.execute(
            select(SKUVendor)
            .options(selectinload(SKUVendor.vendor))
            .where(SKUVendor.sku_id == sku_id)
        ).scalars().all()
    )


# ── Helpers ────────────────────────────────────────────────

def _clear_default_sku_vendor(db: Session, sku_id: int) -> None:
    """Set is_default=False on all SKUVendor rows for a given SKU."""
    rows = db.execute(
        select(SKUVendor).where(
            SKUVendor.sku_id == sku_id,
            SKUVendor.is_default == True,  # noqa: E712
        )
    ).scalars().all()
    for r in rows:
        r.is_default = False


def resolve_tier_price(db: Session, sku_id: int, quantity: int):
    """
    Given a SKU and an order quantity, return the matching tier price.
    Used when creating SO lines to lock in the correct unit price.

    Returns the TierPricing row or None if no tiers are configured.
    """
    tiers = db.execute(
        select(TierPricing)
        .where(TierPricing.sku_id == sku_id)
        .order_by(TierPricing.min_qty)
    ).scalars().all()

    if not tiers:
        return None

    matched_tier = None
    for tier in tiers:
        if quantity >= tier.min_qty:
            if tier.max_qty is None or quantity <= tier.max_qty:
                matched_tier = tier
                break
            # If qty exceeds this tier's max, keep looking
            matched_tier = tier  # fallback to highest qualifying tier

    return matched_tier
