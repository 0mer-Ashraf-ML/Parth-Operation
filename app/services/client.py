"""
Client service – business logic for Client, ClientContact, and ClientAddress.

All permission checks (role-based scoping) happen here, keeping the route
layer thin and focused on HTTP concerns.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.exceptions import ConflictException, NotFoundException
from app.models.client import Client, ClientAddress, ClientContact
from app.schemas.auth import CurrentUser
from app.schemas.client import (
    ClientAddressCreate,
    ClientAddressUpdate,
    ClientContactCreate,
    ClientContactUpdate,
    ClientCreate,
    ClientUpdate,
)
from app.services.permissions import PermissionService


# ═══════════════════════════════════════════════════════════
#  CLIENT CRUD
# ═══════════════════════════════════════════════════════════

def list_clients(
    db: Session,
    current_user: CurrentUser,
    *,
    is_active: bool | None = None,
    search: str | None = None,
) -> list[Client]:
    """
    Return all clients the current user is allowed to see.

    • Admin → all clients.
    • Account Manager → only assigned clients.
    • Vendor → forbidden (raised by PermissionService).
    """
    query = select(Client)
    query = PermissionService.scope_by_client(query, current_user, Client.id)

    if is_active is not None:
        query = query.where(Client.is_active == is_active)
    if search:
        query = query.where(Client.company_name.ilike(f"%{search}%"))

    query = query.order_by(Client.company_name)
    return list(db.execute(query).scalars().all())


def get_client(db: Session, current_user: CurrentUser, client_id: int) -> Client:
    """
    Fetch a single client by ID with contacts + addresses eagerly loaded.
    Raises NotFoundException if not found, ForbiddenException if not accessible.
    """
    client = db.execute(
        select(Client)
        .options(selectinload(Client.contacts), selectinload(Client.addresses))
        .where(Client.id == client_id)
    ).scalar_one_or_none()

    if client is None:
        raise NotFoundException(f"Client with id={client_id} not found")

    PermissionService.assert_can_access_client(current_user, client_id)
    return client


def create_client(db: Session, current_user: CurrentUser, data: ClientCreate) -> Client:
    """
    Create a new client with optional nested contacts and addresses.
    Only Admins can create clients.
    """
    # Check for duplicate company name
    existing = db.execute(
        select(Client).where(Client.company_name == data.company_name)
    ).scalar_one_or_none()
    if existing:
        raise ConflictException(f"A client with the name '{data.company_name}' already exists")

    client = Client(
        company_name=data.company_name,
        payment_terms=data.payment_terms,
        tax_percentage=data.tax_percentage,
        discount_percentage=data.discount_percentage,
        auto_invoice=data.auto_invoice,
        notes=data.notes,
    )

    # Nested contacts
    for c in data.contacts:
        client.contacts.append(
            ClientContact(
                contact_type=c.contact_type,
                name=c.name,
                email=c.email,
                phone=c.phone,
            )
        )

    # Nested addresses
    for a in data.addresses:
        client.addresses.append(
            ClientAddress(
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

    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def update_client(
    db: Session,
    current_user: CurrentUser,
    client_id: int,
    data: ClientUpdate,
) -> Client:
    """
    Partial-update a client.  Only Admins can update clients.
    """
    client = get_client(db, current_user, client_id)

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(client, field, value)

    db.commit()
    db.refresh(client)
    return client


def delete_client(db: Session, current_user: CurrentUser, client_id: int) -> None:
    """
    Soft-delete a client (set is_active=False).  Only Admins.
    """
    client = get_client(db, current_user, client_id)
    client.is_active = False
    db.commit()


# ═══════════════════════════════════════════════════════════
#  CLIENT CONTACT CRUD
# ═══════════════════════════════════════════════════════════

def add_contact(
    db: Session,
    current_user: CurrentUser,
    client_id: int,
    data: ClientContactCreate,
) -> ClientContact:
    """Add a new contact to an existing client."""
    # Validates access
    get_client(db, current_user, client_id)

    contact = ClientContact(
        client_id=client_id,
        contact_type=data.contact_type,
        name=data.name,
        email=data.email,
        phone=data.phone,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


def update_contact(
    db: Session,
    current_user: CurrentUser,
    client_id: int,
    contact_id: int,
    data: ClientContactUpdate,
) -> ClientContact:
    """Update an existing contact on a client."""
    get_client(db, current_user, client_id)

    contact = db.execute(
        select(ClientContact).where(
            ClientContact.id == contact_id,
            ClientContact.client_id == client_id,
        )
    ).scalar_one_or_none()

    if contact is None:
        raise NotFoundException(f"Contact with id={contact_id} not found on client {client_id}")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(contact, field, value)

    db.commit()
    db.refresh(contact)
    return contact


def delete_contact(
    db: Session,
    current_user: CurrentUser,
    client_id: int,
    contact_id: int,
) -> None:
    """Hard-delete a contact from a client."""
    get_client(db, current_user, client_id)

    contact = db.execute(
        select(ClientContact).where(
            ClientContact.id == contact_id,
            ClientContact.client_id == client_id,
        )
    ).scalar_one_or_none()

    if contact is None:
        raise NotFoundException(f"Contact with id={contact_id} not found on client {client_id}")

    db.delete(contact)
    db.commit()


# ═══════════════════════════════════════════════════════════
#  CLIENT ADDRESS CRUD
# ═══════════════════════════════════════════════════════════

def add_address(
    db: Session,
    current_user: CurrentUser,
    client_id: int,
    data: ClientAddressCreate,
) -> ClientAddress:
    """Add a new address to an existing client."""
    get_client(db, current_user, client_id)

    # If this is the default, un-default all others
    if data.is_default:
        _clear_default_addresses(db, client_id)

    address = ClientAddress(
        client_id=client_id,
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


def update_address(
    db: Session,
    current_user: CurrentUser,
    client_id: int,
    address_id: int,
    data: ClientAddressUpdate,
) -> ClientAddress:
    """Update an existing address on a client."""
    get_client(db, current_user, client_id)

    address = db.execute(
        select(ClientAddress).where(
            ClientAddress.id == address_id,
            ClientAddress.client_id == client_id,
        )
    ).scalar_one_or_none()

    if address is None:
        raise NotFoundException(f"Address with id={address_id} not found on client {client_id}")

    # If setting as default, un-default all others first
    if data.is_default is True:
        _clear_default_addresses(db, client_id)

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(address, field, value)

    db.commit()
    db.refresh(address)
    return address


def delete_address(
    db: Session,
    current_user: CurrentUser,
    client_id: int,
    address_id: int,
) -> None:
    """Hard-delete an address from a client."""
    get_client(db, current_user, client_id)

    address = db.execute(
        select(ClientAddress).where(
            ClientAddress.id == address_id,
            ClientAddress.client_id == client_id,
        )
    ).scalar_one_or_none()

    if address is None:
        raise NotFoundException(f"Address with id={address_id} not found on client {client_id}")

    db.delete(address)
    db.commit()


# ── Internal helpers ──────────────────────────────────────

def _clear_default_addresses(db: Session, client_id: int) -> None:
    """Set is_default=False on all addresses for a client."""
    addresses = db.execute(
        select(ClientAddress).where(
            ClientAddress.client_id == client_id,
            ClientAddress.is_default == True,  # noqa: E712
        )
    ).scalars().all()
    for addr in addresses:
        addr.is_default = False
