"""
Authentication routes – login and token refresh.

POST /auth/login    – authenticate with email + password, receive a JWT.
POST /auth/refresh  – exchange a valid JWT for a fresh one (re-reads
                      permissions from the database so updated client
                      assignments take effect immediately).
GET  /auth/me       – return the current user's profile from the token.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.exceptions import UnauthorizedException
from app.models.enums import UserRole
from app.models.user import ClientAssignment, User
from app.config import settings
from app.schemas.auth import (
    CurrentUser,
    LoginRequest,
    TokenResponse,
    UserBrief,
)
from app.services.auth import create_access_token, verify_password
from app.validation import normalize_email

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ── Helpers ────────────────────────────────────────────────

def _get_client_ids(db: Session, user_id: int) -> list[int]:
    """Fetch the list of client IDs assigned to an Account Manager."""
    rows = db.execute(
        select(ClientAssignment.client_id).where(
            ClientAssignment.user_id == user_id,
        )
    ).scalars().all()
    return list(rows)


def _build_token_and_response(db: Session, user: User) -> dict:
    """
    Shared logic for login and refresh – builds the JWT and the
    standard response payload.
    """
    client_ids: list[int] = []
    vendor_id: int | None = None

    if user.role == UserRole.ACCOUNT_MANAGER:
        client_ids = _get_client_ids(db, user.id)
    elif user.role == UserRole.VENDOR:
        vendor_id = user.vendor_id

    access_token = create_access_token(
        user_id=user.id,
        role=user.role.value,
        client_ids=client_ids,
        vendor_id=vendor_id,
        email=user.email,
        full_name=user.full_name,
    )

    return {
        "success": True,
        "data": TokenResponse(
            access_token=access_token,
            expires_in_minutes=settings.JWT_EXPIRATION_MINUTES,
            user=UserBrief(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                role=user.role,
                vendor_id=vendor_id,
                client_ids=client_ids,
            ),
        ),
    }


# ── POST /auth/login ──────────────────────────────────────

@router.post(
    "/login",
    summary="Log in with email and password",
    response_description="JWT access token + user info",
)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate a user.

    On success returns a JWT that must be sent as a Bearer token
    in the ``Authorization`` header of all subsequent requests.
    """
    # 1. Look up user by email
    user = db.execute(
        select(User).where(User.email == normalize_email(body.email))
    ).scalar_one_or_none()

    if user is None:
        raise UnauthorizedException("Invalid email or password")

    # 2. Verify password
    if not verify_password(body.password, user.password_hash):
        raise UnauthorizedException("Invalid email or password")

    # 3. Check account is active
    if not user.is_active:
        raise UnauthorizedException("Account is deactivated")

    # 4. Build token + response
    return _build_token_and_response(db, user)


# ── POST /auth/refresh ────────────────────────────────────

@router.post(
    "/refresh",
    summary="Refresh your access token",
    response_description="New JWT with updated permissions",
)
def refresh_token(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Exchange a valid token for a fresh one.

    This re-reads the user's client assignments from the database,
    so any changes made by an Admin (e.g. assigning a new client
    to an Account Manager) take effect immediately on refresh.
    """
    user = db.execute(
        select(User).where(User.id == current_user.user_id)
    ).scalar_one_or_none()

    if user is None or not user.is_active:
        raise UnauthorizedException("Account not found or deactivated")

    return _build_token_and_response(db, user)


# ── GET /auth/me ───────────────────────────────────────────

@router.get(
    "/me",
    summary="Get current user info from token",
)
def me(current_user: CurrentUser = Depends(get_current_user)):
    """
    Return the identity and permissions embedded in the current JWT.
    Useful for the frontend to know who is logged in and what they can see.
    """
    return {
        "success": True,
        "data": {
            "user_id": current_user.user_id,
            "role": current_user.role.value,
            "client_ids": current_user.client_ids,
            "vendor_id": current_user.vendor_id,
            "email": current_user.email,
            "full_name": current_user.full_name,
        },
    }
