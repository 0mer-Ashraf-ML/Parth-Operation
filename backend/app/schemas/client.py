"""
Pydantic schemas for Client, ClientContact, and ClientAddress endpoints.

Naming convention:
  • *Create  – POST request body
  • *Update  – PATCH request body (all fields optional)
  • *Out     – response body (what the API returns)
"""

from decimal import Decimal
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import AddressType, ContactType


# ═══════════════════════════════════════════════════════════
#  CLIENT CONTACT
# ═══════════════════════════════════════════════════════════

class ClientContactCreate(BaseModel):
    contact_type: ContactType
    name: str = Field(..., min_length=1, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)


class ClientContactUpdate(BaseModel):
    contact_type: Optional[ContactType] = None
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)


class ClientContactOut(BaseModel):
    id: int
    client_id: int
    contact_type: ContactType
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════
#  CLIENT ADDRESS
# ═══════════════════════════════════════════════════════════

class ClientAddressCreate(BaseModel):
    address_type: AddressType = Field(
        AddressType.SHIP_TO,
        description="SHIP_TO or BILLING",
    )
    label: str = Field(..., min_length=1, max_length=255, examples=["Main Warehouse"])
    address_line_1: str = Field(..., min_length=1, max_length=255)
    address_line_2: Optional[str] = Field(None, max_length=255)
    city: str = Field(..., min_length=1, max_length=100)
    state: str = Field(..., min_length=1, max_length=100)
    zip_code: str = Field(..., min_length=1, max_length=20)
    country: str = Field("US", max_length=100)
    is_default: bool = False


class ClientAddressUpdate(BaseModel):
    address_type: Optional[AddressType] = None
    label: Optional[str] = Field(None, min_length=1, max_length=255)
    address_line_1: Optional[str] = Field(None, min_length=1, max_length=255)
    address_line_2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, min_length=1, max_length=100)
    state: Optional[str] = Field(None, min_length=1, max_length=100)
    zip_code: Optional[str] = Field(None, min_length=1, max_length=20)
    country: Optional[str] = Field(None, max_length=100)
    is_default: Optional[bool] = None


class ClientAddressOut(BaseModel):
    id: int
    client_id: int
    address_type: AddressType
    label: str
    address_line_1: str
    address_line_2: Optional[str] = None
    city: str
    state: str
    zip_code: str
    country: str
    is_default: bool

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════
#  CLIENT
# ═══════════════════════════════════════════════════════════

class ClientCreate(BaseModel):
    """POST /clients body."""
    company_name: str = Field(..., min_length=1, max_length=255, examples=["Charles Industries, LLC"])
    payment_terms: int = Field(30, ge=1, description="Net payment days (e.g. 30, 45, 60, 90)")
    tax_percentage: Decimal = Field(Decimal("0.00"), ge=0, le=100)
    discount_percentage: Decimal = Field(Decimal("0.00"), ge=0, le=100)
    auto_invoice: bool = False
    notes: Optional[str] = None
    # Nested – create contacts and addresses together with the client
    contacts: list[ClientContactCreate] = []
    addresses: list[ClientAddressCreate] = []


class ClientUpdate(BaseModel):
    """PATCH /clients/{id} body.  Only include fields you want to change."""
    company_name: Optional[str] = Field(None, min_length=1, max_length=255)
    payment_terms: Optional[int] = Field(None, ge=1)
    tax_percentage: Optional[Decimal] = Field(None, ge=0, le=100)
    discount_percentage: Optional[Decimal] = Field(None, ge=0, le=100)
    auto_invoice: Optional[bool] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    billing_address_id: Optional[int] = Field(
        None,
        description="Canonical invoice billing address (must be a BILLING address on this client)",
    )


class ClientListOut(BaseModel):
    """Lightweight representation used in list endpoints."""
    id: int
    company_name: str
    payment_terms: int
    tax_percentage: Decimal
    discount_percentage: Decimal
    auto_invoice: bool
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ClientDetailOut(BaseModel):
    """Full representation with nested contacts and addresses."""
    id: int
    company_name: str
    payment_terms: int
    tax_percentage: Decimal
    discount_percentage: Decimal
    auto_invoice: bool
    notes: Optional[str] = None
    is_active: bool
    billing_address_id: Optional[int] = None
    billing_address: Optional[ClientAddressOut] = None
    created_at: datetime
    updated_at: datetime
    contacts: list[ClientContactOut] = []
    addresses: list[ClientAddressOut] = []

    model_config = {"from_attributes": True}
