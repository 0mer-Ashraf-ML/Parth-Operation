"""
FastAPI dependencies for authentication and role-based access control.

Usage in route handlers
───────────────────────
    from app.dependencies import get_current_user, require_roles
    from app.schemas.auth import CurrentUser

    # Any authenticated user
    @router.get("/me")
    def me(current_user: CurrentUser = Depends(get_current_user)):
        ...

    # Only admins
    @router.post("/users")
    def create_user(current_user: CurrentUser = Depends(require_roles(UserRole.ADMIN))):
        ...

    # Admin or Account Manager
    @router.get("/clients")
    def list_clients(
        current_user: CurrentUser = Depends(
            require_roles(UserRole.ADMIN, UserRole.ACCOUNT_MANAGER)
        ),
    ):
        ...
"""

from typing import Callable

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.exceptions import ForbiddenException, UnauthorizedException
from app.models.enums import UserRole
from app.schemas.auth import CurrentUser
from app.services.auth import decode_access_token

# ── Bearer token extractor ────────────────────────────────
# auto_error=False so we can return our own error shape instead of
# FastAPI's default 403.
_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> CurrentUser:
    """
    Core auth dependency – validates the JWT from the Authorization header
    and returns a ``CurrentUser`` object that every downstream dependency
    and route handler can use.

    Raises UnauthorizedException (401) when:
      • No token is provided
      • Token is expired / invalid / tampered with
      • Required claims are missing
    """
    if credentials is None:
        raise UnauthorizedException("Missing authorization header")

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise UnauthorizedException("Invalid or expired token")

    # Extract claims
    user_id_raw = payload.get("sub")
    role_raw = payload.get("role")

    if user_id_raw is None or role_raw is None:
        raise UnauthorizedException("Token is missing required claims")

    try:
        role = UserRole(role_raw)
    except ValueError:
        raise UnauthorizedException("Token contains an invalid role")

    return CurrentUser(
        user_id=int(user_id_raw),
        role=role,
        client_ids=payload.get("client_ids", []),
        vendor_id=payload.get("vendor_id"),
    )


# ── Role-based guards ─────────────────────────────────────

def require_roles(*allowed_roles: UserRole) -> Callable:
    """
    Dependency factory – returns a dependency that:
      1. Authenticates the user (via ``get_current_user``).
      2. Checks their role is in ``allowed_roles``.
      3. Raises 403 if not.

    Example:
        require_roles(UserRole.ADMIN)
        require_roles(UserRole.ADMIN, UserRole.ACCOUNT_MANAGER)
    """

    async def _guard(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if current_user.role not in allowed_roles:
            allowed = ", ".join(r.value for r in allowed_roles)
            raise ForbiddenException(
                f"This action requires one of the following roles: {allowed}"
            )
        return current_user

    return _guard


# ── Convenience shortcuts ──────────────────────────────────
# Use these directly as dependencies for the most common patterns.

require_admin = require_roles(UserRole.ADMIN)
"""Only Admins can access."""

require_admin_or_am = require_roles(UserRole.ADMIN, UserRole.ACCOUNT_MANAGER)
"""Admins and Account Managers can access."""

require_any_role = require_roles(
    UserRole.ADMIN, UserRole.ACCOUNT_MANAGER, UserRole.VENDOR,
)
"""Any authenticated user can access (just validates the token)."""
