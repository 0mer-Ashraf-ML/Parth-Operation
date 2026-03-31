"""
Pydantic schemas for Vendor and VendorAddress endpoints.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.validation import validate_optional_email_like


# ═══════════════════════════════════════════════════════════
#  VENDOR ADDRESS
# ═══════════════════════════════════════════════════════════

class VendorAddressCreate(BaseModel):
    """POST /vendors/{vendor_id}/addresses body."""
    label: str = Field(..., min_length=1, max_length=255, examples=["Manufacturing Plant"])
    address_line_1: str = Field(..., min_length=1, max_length=255)
    address_line_2: Optional[str] = Field(None, max_length=255)
    city: str = Field(..., min_length=1, max_length=100)
    state: str = Field(..., min_length=1, max_length=100)
    zip_code: str = Field(..., min_length=1, max_length=20)
    country: str = Field("US", max_length=100)
    is_default: bool = False


class VendorAddressUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=255)
    address_line_1: Optional[str] = Field(None, min_length=1, max_length=255)
    address_line_2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, min_length=1, max_length=100)
    state: Optional[str] = Field(None, min_length=1, max_length=100)
    zip_code: Optional[str] = Field(None, min_length=1, max_length=20)
    country: Optional[str] = Field(None, max_length=100)
    is_default: Optional[bool] = None


class VendorAddressOut(BaseModel):
    id: int
    vendor_id: int
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
#  VENDOR
# ═══════════════════════════════════════════════════════════

class VendorCreate(BaseModel):
    """POST /vendors body."""
    company_name: str = Field(..., min_length=1, max_length=255, examples=["AppleCorp"])
    contact_name: Optional[str] = Field(None, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    lead_time_weeks: Optional[int] = Field(
        None, ge=0, le=104,
        description="Typical manufacturing/delivery lead time in weeks",
        examples=[4],
    )
    # Nested – create addresses together with the vendor
    addresses: list[VendorAddressCreate] = []

    @field_validator("email")
    @classmethod
    def email_format(cls, v: Optional[str]) -> Optional[str]:
        return validate_optional_email_like(v)


class VendorUpdate(BaseModel):
    """PATCH /vendors/{id} body."""
    company_name: Optional[str] = Field(None, min_length=1, max_length=255)
    contact_name: Optional[str] = Field(None, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    lead_time_weeks: Optional[int] = Field(None, ge=0, le=104)
    is_active: Optional[bool] = None

    @field_validator("email")
    @classmethod
    def email_format(cls, v: Optional[str]) -> Optional[str]:
        return validate_optional_email_like(v)


class VendorListOut(BaseModel):
    id: int
    company_name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    lead_time_weeks: Optional[int] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class VendorDetailOut(BaseModel):
    id: int
    company_name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    lead_time_weeks: Optional[int] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    addresses: list[VendorAddressOut] = []

    model_config = {"from_attributes": True}
