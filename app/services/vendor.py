"""
Vendor service – business logic for Vendor CRUD.

Only Admins can create, update, or delete vendors.
Admin and Account Managers can list/view vendors.
Vendors can only see their own record.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.exceptions import ConflictException, ForbiddenException, NotFoundException
from app.models.enums import UserRole
from app.models.vendor import Vendor
from app.schemas.auth import CurrentUser
from app.schemas.vendor import VendorCreate, VendorUpdate


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
    query = select(Vendor)

    if current_user.role == UserRole.VENDOR:
        if current_user.vendor_id is None:
            raise ForbiddenException("Vendor account is not linked to a vendor record")
        query = query.where(Vendor.id == current_user.vendor_id)

    if is_active is not None:
        query = query.where(Vendor.is_active == is_active)
    if search:
        query = query.where(Vendor.company_name.ilike(f"%{search}%"))

    query = query.order_by(Vendor.company_name)
    return list(db.execute(query).scalars().all())


def get_vendor(db: Session, current_user: CurrentUser, vendor_id: int) -> Vendor:
    """Fetch a single vendor by ID.  Vendors can only see their own record."""
    vendor = db.execute(
        select(Vendor).where(Vendor.id == vendor_id)
    ).scalar_one_or_none()

    if vendor is None:
        raise NotFoundException(f"Vendor with id={vendor_id} not found")

    # Vendor users can only see their own
    if current_user.role == UserRole.VENDOR and current_user.vendor_id != vendor_id:
        raise ForbiddenException("You can only view your own vendor record")

    return vendor


def create_vendor(db: Session, data: VendorCreate) -> Vendor:
    """Create a new vendor.  Only Admins (enforced at route level)."""
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
    vendor.is_active = False
    db.commit()
