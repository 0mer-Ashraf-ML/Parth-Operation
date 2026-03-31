"""
Vendor service – business logic for Vendor CRUD and VendorAddress CRUD.

Only Admins can create, update, or delete vendors and their addresses.
Admin and Account Managers can list/view vendors.
Vendors can only see their own record.
"""

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.exceptions import (
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
)
from app.models.enums import UserRole
from app.models.vendor import Vendor, VendorAddress
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
    is_active: bool | None = None,
    search: str | None = None,
) -> list[Vendor]:
    """
    Return vendors visible to the current user.

    • Admin / AM → all vendors.
    • Vendor     → only their own vendor record.
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


def delete_vendor(db: Session, current_user: CurrentUser, vendor_id: int) -> None:
    """Soft-delete a vendor (set is_active=False).  Only Admins."""
    vendor = get_vendor(db, current_user, vendor_id)
    _assert_vendor_can_be_deactivated(db, vendor_id)
    vendor.is_active = False
    db.commit()


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


def _assert_vendor_can_be_deactivated(db: Session, vendor_id: int) -> None:
    """
    Block vendor deactivation while active SKUs still reference the vendor.

    The frontend can present the returned SKU codes to the admin so they can
    unlink or reassign those SKUs before retrying the deactivation.
    """
    from app.models.sku import SKU, SKUVendor

    linked_skus = db.execute(
        select(SKU.sku_code)
        .outerjoin(
            SKUVendor,
            (SKUVendor.sku_id == SKU.id) & (SKUVendor.vendor_id == vendor_id),
        )
        .where(
            SKU.is_active.is_(True),
            or_(
                SKU.default_vendor_id == vendor_id,
                SKU.secondary_vendor_id == vendor_id,
                SKUVendor.id.is_not(None),
            ),
        )
        .order_by(SKU.sku_code.asc())
    ).scalars().all()

    if linked_skus:
        raise BadRequestException(
            "Cannot deactivate vendor while it is still linked to active SKUs: "
            f"{', '.join(linked_skus)}. Reassign or unlink those SKU relationships first.",
        )
