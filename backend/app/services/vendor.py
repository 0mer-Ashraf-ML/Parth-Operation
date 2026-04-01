"""
Vendor service – business logic for Vendor CRUD and VendorAddress CRUD.

Only Admins can create, update, or delete vendors and their addresses.
Admin and Account Managers can list/view vendors.
Vendors can only see their own record.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.exceptions import ConflictException, ForbiddenException, NotFoundException
from app.models.enums import UserRole
from app.models.vendor import Vendor, VendorAddress
from app.models.sku import SKU, SKUVendor
from app.schemas.auth import CurrentUser
from app.schemas.vendor import (
    VendorAddressCreate,
    VendorAddressUpdate,
    VendorCreate,
    VendorUpdate,
)


# ═══════════════════════════════════════════════════════════
#  VENDOR CRUD
# ═══════════════════════════════════════════════════════════

def list_vendors(
    db: Session,
    current_user: CurrentUser,
    *,
    is_active: bool | None = True,  # default: only active vendors shown in dropdowns
    search: str | None = None,
) -> list[Vendor]:
    """
    Return vendors visible to the current user.

    • Admin / AM → all vendors (default: active only; pass is_active=None for all).
    • Vendor     → only their own vendor record.

    Default is_active=True ensures inactive vendors never appear in dropdowns.
    Pass is_active=None explicitly to list all (e.g. Admin management page).
    """
    query = select(Vendor).options(selectinload(Vendor.addresses))

    if current_user.role == UserRole.VENDOR:
        if current_user.vendor_id is None:
            raise ForbiddenException("Vendor account is not linked to a vendor record")
        query = query.where(Vendor.id == current_user.vendor_id)

    if is_active is not None:
        query = query.where(Vendor.is_active == is_active)
    if search:
        query = query.where(Vendor.company_name.ilike(f"%{search}%"))

    query = query.order_by(Vendor.company_name)
    return list(db.execute(query).scalars().unique().all())


def get_vendor(db: Session, current_user: CurrentUser, vendor_id: int) -> Vendor:
    """Fetch a single vendor by ID with addresses.  Vendors can only see their own record."""
    vendor = db.execute(
        select(Vendor)
        .options(selectinload(Vendor.addresses))
        .where(Vendor.id == vendor_id)
    ).scalar_one_or_none()

    if vendor is None:
        raise NotFoundException(f"Vendor with id={vendor_id} not found")

    # Vendor users can only see their own
    if current_user.role == UserRole.VENDOR and current_user.vendor_id != vendor_id:
        raise ForbiddenException("You can only view your own vendor record")

    return vendor


def create_vendor(db: Session, data: VendorCreate) -> Vendor:
    """Create a new vendor with optional nested addresses.  Only Admins (enforced at route level)."""
    existing = db.execute(
        select(Vendor).where(Vendor.company_name == data.company_name)
    ).scalar_one_or_none()
    if existing:
        raise ConflictException(f"A vendor with the name '{data.company_name}' already exists")

    vendor = Vendor(
        company_name=data.company_name,
        contact_name=data.contact_name,
        email=data.email,
        phone=data.phone,
        lead_time_weeks=data.lead_time_weeks,
    )

    # Nested addresses
    for a in data.addresses:
        vendor.addresses.append(
            VendorAddress(
                label=a.label,
                address_line_1=a.address_line_1,
                address_line_2=a.address_line_2,
                city=a.city,
                state=a.state,
                zip_code=a.zip_code,
                country=a.country,
                is_default=a.is_default,
            )
        )

    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


def update_vendor(
    db: Session,
    current_user: CurrentUser,
    vendor_id: int,
    data: VendorUpdate,
) -> Vendor:
    """Partial-update a vendor.  Only Admins."""
    vendor = get_vendor(db, current_user, vendor_id)

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(vendor, field, value)

    db.commit()
    db.refresh(vendor)
    return vendor


def get_vendor_linked_skus(db: Session, vendor_id: int) -> dict:
    """
    Return a summary of all SKUs linked to this vendor via:
      - sku_vendors mapping table
      - skus.default_vendor_id
      - skus.secondary_vendor_id

    Used before deactivation to warn the admin.
    """
    # SKUs via sku_vendors mapping table
    via_mapping = db.execute(
        select(SKU.id, SKU.sku_code, SKU.name)
        .join(SKUVendor, SKUVendor.sku_id == SKU.id)
        .where(SKUVendor.vendor_id == vendor_id)
        .where(SKU.is_active == True)  # noqa: E712
    ).all()

    # SKUs where vendor is set as default
    as_default = db.execute(
        select(SKU.id, SKU.sku_code, SKU.name)
        .where(SKU.default_vendor_id == vendor_id)
        .where(SKU.is_active == True)  # noqa: E712
    ).all()

    # SKUs where vendor is set as secondary
    as_secondary = db.execute(
        select(SKU.id, SKU.sku_code, SKU.name)
        .where(SKU.secondary_vendor_id == vendor_id)
        .where(SKU.is_active == True)  # noqa: E712
    ).all()

    # Deduplicate by SKU id across all three sources
    seen: set[int] = set()
    skus: list[dict] = []
    for row in [*via_mapping, *as_default, *as_secondary]:
        if row.id not in seen:
            seen.add(row.id)
            skus.append({"id": row.id, "sku_code": row.sku_code, "name": row.name})

    return {"linked_skus_count": len(skus), "linked_skus": skus}


def delete_vendor(
    db: Session,
    current_user: CurrentUser,
    vendor_id: int,
    force_unlink: bool = False,
) -> dict:
    """
    Deactivate a vendor (soft-delete).  Only Admins.

    Two-step safety flow:
      1. First call (force_unlink=False):
         - If the vendor is linked to any active SKUs, raises ConflictException
           with the full list of linked SKUs so the frontend can show a
           confirmation dialog.
         - If no links exist, deactivates immediately.

      2. Second call (force_unlink=True — admin confirmed the dialog):
         - Removes all SKUVendor mapping rows for this vendor.
         - Sets default_vendor_id / secondary_vendor_id to NULL on linked SKUs.
         - Then sets vendor.is_active = False.
    """
    vendor = get_vendor(db, current_user, vendor_id)

    link_info = get_vendor_linked_skus(db, vendor_id)

    if link_info["linked_skus_count"] > 0 and not force_unlink:
        # Return structured info so the frontend can build a good modal message
        sku_names = ", ".join(s["sku_code"] for s in link_info["linked_skus"][:5])
        extra = f" and {link_info['linked_skus_count'] - 5} more" if link_info["linked_skus_count"] > 5 else ""
        raise ConflictException(
            f"Vendor '{vendor.company_name}' is linked to "
            f"{link_info['linked_skus_count']} active SKU(s) "
            f"({sku_names}{extra}). "
            f"To deactivate this vendor, all linked SKUs must be unlinked first. "
            f"Confirm to unlink and deactivate.",
            extra={
                "linked_skus_count": link_info["linked_skus_count"],
                "linked_skus": link_info["linked_skus"],
                "vendor_id": vendor_id,
                "vendor_name": vendor.company_name,
                "action_required": "confirm_unlink",
            },
        )

    if force_unlink and link_info["linked_skus_count"] > 0:
        # Remove all SKUVendor mapping rows
        sku_vendor_rows = db.execute(
            select(SKUVendor).where(SKUVendor.vendor_id == vendor_id)
        ).scalars().all()
        for row in sku_vendor_rows:
            db.delete(row)

        # Null out default_vendor_id references
        default_skus = db.execute(
            select(SKU).where(SKU.default_vendor_id == vendor_id)
        ).scalars().all()
        for sku in default_skus:
            sku.default_vendor_id = None

        # Null out secondary_vendor_id references
        secondary_skus = db.execute(
            select(SKU).where(SKU.secondary_vendor_id == vendor_id)
        ).scalars().all()
        for sku in secondary_skus:
            sku.secondary_vendor_id = None

        db.flush()

    vendor.is_active = False
    db.commit()

    return {
        "vendor_id": vendor_id,
        "vendor_name": vendor.company_name,
        "unlinked_skus_count": link_info["linked_skus_count"] if force_unlink else 0,
    }


# ═══════════════════════════════════════════════════════════
#  VENDOR ADDRESS CRUD
# ═══════════════════════════════════════════════════════════

def add_vendor_address(
    db: Session,
    current_user: CurrentUser,
    vendor_id: int,
    data: VendorAddressCreate,
) -> VendorAddress:
    """Add a new address to an existing vendor."""
    get_vendor(db, current_user, vendor_id)

    # If this is the default, un-default all others
    if data.is_default:
        _clear_default_addresses(db, vendor_id)

    address = VendorAddress(
        vendor_id=vendor_id,
        label=data.label,
        address_line_1=data.address_line_1,
        address_line_2=data.address_line_2,
        city=data.city,
        state=data.state,
        zip_code=data.zip_code,
        country=data.country,
        is_default=data.is_default,
    )
    db.add(address)
    db.commit()
    db.refresh(address)
    return address


def update_vendor_address(
    db: Session,
    current_user: CurrentUser,
    vendor_id: int,
    address_id: int,
    data: VendorAddressUpdate,
) -> VendorAddress:
    """Update an existing address on a vendor."""
    get_vendor(db, current_user, vendor_id)

    address = db.execute(
        select(VendorAddress).where(
            VendorAddress.id == address_id,
            VendorAddress.vendor_id == vendor_id,
        )
    ).scalar_one_or_none()

    if address is None:
        raise NotFoundException(f"Address with id={address_id} not found on vendor {vendor_id}")

    # If setting as default, un-default all others first
    if data.is_default is True:
        _clear_default_addresses(db, vendor_id)

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(address, field, value)

    db.commit()
    db.refresh(address)
    return address


def delete_vendor_address(
    db: Session,
    current_user: CurrentUser,
    vendor_id: int,
    address_id: int,
) -> None:
    """Hard-delete an address from a vendor."""
    get_vendor(db, current_user, vendor_id)

    address = db.execute(
        select(VendorAddress).where(
            VendorAddress.id == address_id,
            VendorAddress.vendor_id == vendor_id,
        )
    ).scalar_one_or_none()

    if address is None:
        raise NotFoundException(f"Address with id={address_id} not found on vendor {vendor_id}")

    db.delete(address)
    db.commit()


# ── Internal helpers ──────────────────────────────────────

def _clear_default_addresses(db: Session, vendor_id: int) -> None:
    """Set is_default=False on all addresses for a vendor."""
    addresses = db.execute(
        select(VendorAddress).where(
            VendorAddress.vendor_id == vendor_id,
            VendorAddress.is_default == True,  # noqa: E712
        )
    ).scalars().all()
    for addr in addresses:
        addr.is_default = False
