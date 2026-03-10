"""
Client routes – full CRUD for Clients, Contacts, and Addresses.

Permission matrix:
    Action          │ Admin │ AM  │ Vendor
    ────────────────┼───────┼─────┼───────
    List clients    │  ✓    │  ✓* │  ✗
    Get client      │  ✓    │  ✓* │  ✗
    Create client   │  ✓    │  ✗  │  ✗
    Update client   │  ✓    │  ✗  │  ✗
    Delete client   │  ✓    │  ✗  │  ✗
    Manage contacts │  ✓    │  ✗  │  ✗
    Manage addresses│  ✓    │  ✗  │  ✗

    * AM sees only assigned clients (enforced at DB query level).
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_admin, require_admin_or_am
from app.schemas.auth import CurrentUser
from app.schemas.client import (
    ClientAddressCreate,
    ClientAddressOut,
    ClientAddressUpdate,
    ClientContactCreate,
    ClientContactOut,
    ClientContactUpdate,
    ClientCreate,
    ClientDetailOut,
    ClientListOut,
    ClientUpdate,
)
from app.services import client as client_svc

router = APIRouter(prefix="/clients", tags=["Clients"])


# ═══════════════════════════════════════════════════════════
#  CLIENT ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.get(
    "",
    summary="List clients",
    response_description="Array of clients visible to the caller",
)
def list_clients(
    is_active: bool | None = Query(None, description="Filter by active status"),
    search: str | None = Query(None, description="Search by company name"),
    current_user: CurrentUser = Depends(require_admin_or_am),
    db: Session = Depends(get_db),
):
    clients = client_svc.list_clients(
        db, current_user, is_active=is_active, search=search,
    )
    return {
        "success": True,
        "data": [ClientListOut.model_validate(c) for c in clients],
    }


@router.get(
    "/{client_id}",
    summary="Get client details",
    response_description="Full client profile with contacts and addresses",
)
def get_client(
    client_id: int,
    current_user: CurrentUser = Depends(require_admin_or_am),
    db: Session = Depends(get_db),
):
    client = client_svc.get_client(db, current_user, client_id)
    return {
        "success": True,
        "data": ClientDetailOut.model_validate(client),
    }


@router.post(
    "",
    summary="Create a new client",
    response_description="The newly created client",
    status_code=201,
)
def create_client(
    body: ClientCreate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    client = client_svc.create_client(db, current_user, body)
    # Re-fetch with relationships loaded
    client = client_svc.get_client(db, current_user, client.id)
    return {
        "success": True,
        "data": ClientDetailOut.model_validate(client),
    }


@router.patch(
    "/{client_id}",
    summary="Update a client",
    response_description="The updated client",
)
def update_client(
    client_id: int,
    body: ClientUpdate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    client = client_svc.update_client(db, current_user, client_id, body)
    client = client_svc.get_client(db, current_user, client.id)
    return {
        "success": True,
        "data": ClientDetailOut.model_validate(client),
    }


@router.delete(
    "/{client_id}",
    summary="Soft-delete a client (deactivate)",
    status_code=200,
)
def delete_client(
    client_id: int,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    client_svc.delete_client(db, current_user, client_id)
    return {"success": True, "data": {"message": "Client deactivated"}}


# ═══════════════════════════════════════════════════════════
#  CLIENT CONTACT ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.post(
    "/{client_id}/contacts",
    summary="Add a contact to a client",
    status_code=201,
)
def add_contact(
    client_id: int,
    body: ClientContactCreate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    contact = client_svc.add_contact(db, current_user, client_id, body)
    return {
        "success": True,
        "data": ClientContactOut.model_validate(contact),
    }


@router.patch(
    "/{client_id}/contacts/{contact_id}",
    summary="Update a contact on a client",
)
def update_contact(
    client_id: int,
    contact_id: int,
    body: ClientContactUpdate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    contact = client_svc.update_contact(db, current_user, client_id, contact_id, body)
    return {
        "success": True,
        "data": ClientContactOut.model_validate(contact),
    }


@router.delete(
    "/{client_id}/contacts/{contact_id}",
    summary="Delete a contact from a client",
)
def delete_contact(
    client_id: int,
    contact_id: int,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    client_svc.delete_contact(db, current_user, client_id, contact_id)
    return {"success": True, "data": {"message": "Contact deleted"}}


# ═══════════════════════════════════════════════════════════
#  CLIENT ADDRESS ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.post(
    "/{client_id}/addresses",
    summary="Add an address to a client",
    status_code=201,
)
def add_address(
    client_id: int,
    body: ClientAddressCreate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    address = client_svc.add_address(db, current_user, client_id, body)
    return {
        "success": True,
        "data": ClientAddressOut.model_validate(address),
    }


@router.patch(
    "/{client_id}/addresses/{address_id}",
    summary="Update an address on a client",
)
def update_address(
    client_id: int,
    address_id: int,
    body: ClientAddressUpdate,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    address = client_svc.update_address(
        db, current_user, client_id, address_id, body,
    )
    return {
        "success": True,
        "data": ClientAddressOut.model_validate(address),
    }


@router.delete(
    "/{client_id}/addresses/{address_id}",
    summary="Delete an address from a client",
)
def delete_address(
    client_id: int,
    address_id: int,
    current_user: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    client_svc.delete_address(db, current_user, client_id, address_id)
    return {"success": True, "data": {"message": "Address deleted"}}
