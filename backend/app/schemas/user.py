"""
Pydantic schemas for user API requests and responses.
"""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.enums import UserRole


class UserOut(BaseModel):
    """User row for API responses (excludes password_hash)."""

    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    vendor_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: UserRole
    vendor_id: int | None = None

    @model_validator(mode="after")
    def vendor_required_when_vendor_role(self):
        # Non-vendor roles never store vendor_id; ignore stray values (e.g. 0 from form defaults).
        if self.role != UserRole.VENDOR:
            return self.model_copy(update={"vendor_id": None})
        if self.vendor_id is None:
            raise ValueError("vendor_id is required when role is vendor")
        return self


class UserUpdate(BaseModel):
    """Partial update (profile and status). Role changes use PATCH .../role."""

    email: str | None = Field(None, min_length=3, max_length=255)
    full_name: str | None = Field(None, min_length=1, max_length=255)
    password: str | None = Field(None, min_length=8, max_length=128)
    is_active: bool | None = None


class UserRoleUpdate(BaseModel):
    role: UserRole
    vendor_id: int | None = None

    @model_validator(mode="after")
    def vendor_rules(self):
        if self.role != UserRole.VENDOR:
            return self.model_copy(update={"vendor_id": None})
        if self.vendor_id is None:
            raise ValueError("vendor_id is required when role is vendor")
        return self
