"""
Pydantic schemas for user API requests and responses.
"""

from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import UserRole
from app.password_policy import validate_new_password


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
    password: str = Field(..., min_length=10, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: UserRole
    vendor_id: int | None = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return validate_new_password(v)

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
    password: str | None = Field(None, min_length=10, max_length=128)
    is_active: bool | None = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return validate_new_password(v)


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
