"""
Pydantic schemas for authentication endpoints.
"""

from pydantic import BaseModel, Field, field_validator

from app.models.enums import UserRole
from app.validation import validate_email_like


# ── Request schemas ────────────────────────────────────────

class LoginRequest(BaseModel):
    """POST /auth/login body."""
    email: str = Field(..., examples=["admin@dpm.com"])
    password: str = Field(..., min_length=1, examples=["admin123"])

    @field_validator("email")
    @classmethod
    def email_format(cls, v: str) -> str:
        return validate_email_like(v)


# ── Response schemas ───────────────────────────────────────

class TokenResponse(BaseModel):
    """Returned after a successful login or token refresh."""
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    user: "UserBrief"


class UserBrief(BaseModel):
    """Minimal user info returned alongside the token."""
    id: int
    email: str
    full_name: str
    role: UserRole
    vendor_id: int | None = None
    client_ids: list[int] = []

    model_config = {"from_attributes": True}


# ── Internal token data (not an API schema) ────────────────

class CurrentUser(BaseModel):
    """
    Decoded JWT payload – available in every protected endpoint via
    the ``get_current_user`` dependency.

    This is NOT sent over the wire; it is built from the JWT claims
    inside the dependency and passed to route handlers.
    """
    user_id: int
    role: UserRole
    client_ids: list[int] = []
    vendor_id: int | None = None
    email: str = ""
    full_name: str = ""
