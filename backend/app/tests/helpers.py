from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.client import Client, ClientAddress
from app.models.enums import (
    AddressType,
    ContactType,
    EventSource,
    ShipmentType,
    UserRole,
)
from app.models.sales_order import SOLine, SalesOrder
from app.models.sku import SKU, SKUVendor, TierPricing
from app.models.user import ClientAssignment, User
from app.models.vendor import Vendor
from app.schemas.auth import CurrentUser
from app.services.auth import create_access_token, hash_password


DEFAULT_PASSWORD = "StrongPass123!"


def unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}@example.com"


def create_vendor(
    db: Session,
    *,
    company_name: str | None = None,
    is_active: bool = True,
) -> Vendor:
    vendor = Vendor(
        company_name=company_name or f"Vendor {uuid4().hex[:6]}",
        contact_name="Vendor Contact",
        email=unique_email("vendor"),
        phone="1234567890",
        is_active=is_active,
    )
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


def create_user(
    db: Session,
    *,
    role: UserRole,
    email: str | None = None,
    full_name: str | None = None,
    vendor: Vendor | None = None,
    is_active: bool = True,
    password: str = DEFAULT_PASSWORD,
) -> User:
    user = User(
        email=email or unique_email(role.value),
        password_hash=hash_password(password),
        full_name=full_name or role.value.replace("_", " ").title(),
        role=role,
        is_active=is_active,
        vendor_id=vendor.id if vendor else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_client(
    db: Session,
    *,
    company_name: str | None = None,
    is_active: bool = True,
) -> Client:
    client = Client(
        company_name=company_name or f"Client {uuid4().hex[:6]}",
        payment_terms=30,
        tax_percentage=Decimal("0.00"),
        discount_percentage=Decimal("0.00"),
        auto_invoice=False,
        is_active=is_active,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def create_client_address(
    db: Session,
    client: Client,
    *,
    address_type: AddressType = AddressType.SHIP_TO,
    label: str = "Distribution Center",
    is_default: bool = True,
) -> ClientAddress:
    address = ClientAddress(
        client_id=client.id,
        address_type=address_type,
        label=label,
        address_line_1="123 Test Street",
        city="Dallas",
        state="TX",
        zip_code="75001",
        country="US",
        is_default=is_default,
    )
    db.add(address)
    db.commit()
    db.refresh(address)
    return address


def assign_client_to_am(db: Session, am_user: User, client: Client) -> None:
    assignment = ClientAssignment(user_id=am_user.id, client_id=client.id)
    db.add(assignment)
    db.commit()


def create_sku(
    db: Session,
    *,
    sku_code: str | None = None,
    name: str | None = None,
    default_vendor: Vendor | None = None,
    secondary_vendor: Vendor | None = None,
    track_inventory: bool = False,
    inventory_count: int = 0,
    is_active: bool = True,
) -> SKU:
    sku = SKU(
        sku_code=sku_code or f"SKU-{uuid4().hex[:6]}",
        name=name or f"SKU {uuid4().hex[:6]}",
        description="Test SKU",
        default_vendor_id=default_vendor.id if default_vendor else None,
        secondary_vendor_id=secondary_vendor.id if secondary_vendor else None,
        track_inventory=track_inventory,
        inventory_count=inventory_count,
        is_active=is_active,
    )
    db.add(sku)
    db.commit()
    db.refresh(sku)
    return sku


def add_tier_price(
    db: Session,
    sku: SKU,
    *,
    min_qty: int,
    max_qty: int | None,
    unit_price: str,
) -> TierPricing:
    tier = TierPricing(
        sku_id=sku.id,
        min_qty=min_qty,
        max_qty=max_qty,
        unit_price=Decimal(unit_price),
    )
    db.add(tier)
    db.commit()
    db.refresh(tier)
    return tier


def link_sku_vendor(
    db: Session,
    sku: SKU,
    vendor: Vendor,
    *,
    is_default: bool = False,
    vendor_cost: str | None = None,
) -> SKUVendor:
    mapping = SKUVendor(
        sku_id=sku.id,
        vendor_id=vendor.id,
        is_default=is_default,
        vendor_cost=Decimal(vendor_cost) if vendor_cost is not None else None,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return mapping


def create_sales_order_direct(
    db: Session,
    *,
    creator: User,
    client: Client,
    ship_to_address: ClientAddress | None = None,
    sku: SKU,
    ordered_qty: int = 10,
    unit_price: str = "3.50",
    due_date: date | None = None,
) -> SalesOrder:
    so = SalesOrder(
        order_number=f"SO-{uuid4().hex[:8]}",
        client_id=client.id,
        ship_to_address_id=ship_to_address.id if ship_to_address else None,
        ship_to_contact_name="Receiver Name",
        created_by=creator.id,
        order_date=date(2026, 4, 1),
    )
    so.lines.append(
        SOLine(
            sku_id=sku.id,
            line_number=1,
            ordered_qty=ordered_qty,
            unit_price=Decimal(unit_price),
            due_date=due_date,
        )
    )
    db.add(so)
    db.commit()
    db.refresh(so)
    return so


def current_user_for(
    db: Session,
    user: User,
) -> CurrentUser:
    client_ids = []
    if user.role == UserRole.ACCOUNT_MANAGER:
        client_ids = [row.client_id for row in db.query(ClientAssignment).filter_by(user_id=user.id).all()]

    return CurrentUser(
        user_id=user.id,
        role=user.role,
        client_ids=client_ids,
        vendor_id=user.vendor_id,
        email=user.email,
        full_name=user.full_name,
    )


def auth_headers_for(
    db: Session,
    user: User,
) -> dict[str, str]:
    current_user = current_user_for(db, user)
    token = create_access_token(
        user_id=user.id,
        role=user.role.value,
        client_ids=current_user.client_ids,
        vendor_id=user.vendor_id,
        email=user.email,
        full_name=user.full_name,
    )
    return {"Authorization": f"Bearer {token}"}
