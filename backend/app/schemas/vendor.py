"""
Pydantic schemas for Vendor endpoints.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


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


class VendorUpdate(BaseModel):
    """PATCH /vendors/{id} body."""
    company_name: Optional[str] = Field(None, min_length=1, max_length=255)
    contact_name: Optional[str] = Field(None, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    lead_time_weeks: Optional[int] = Field(None, ge=0, le=104)
    is_active: Optional[bool] = None


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

    model_config = {"from_attributes": True}
