"""
Authentication service – password hashing and JWT token management.

Password hashing uses bcrypt via passlib.
JWT tokens carry: user_id, role, assigned client_ids, and vendor_id.
"""

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

# ── Password hashing ──────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    """Hash a plain-text password with bcrypt."""
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check a plain-text password against a bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


# ── JWT token creation ────────────────────────────────────

def create_access_token(
    user_id: int,
    role: str,
    client_ids: list[int] | None = None,
    vendor_id: int | None = None,
    email: str = "",
    full_name: str = "",
) -> str:
    """
    Build a signed JWT containing the user's identity and permissions.

    Payload:
        sub        – user ID (string, per JWT spec)
        role       – admin | account_manager | vendor
        client_ids – list of accessible client PKs (Account Managers only)
        vendor_id  – linked vendor PK (Vendors only)
        email      – user email
        full_name  – user full name
        exp        – expiration timestamp
        iat        – issued-at timestamp
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "client_ids": client_ids or [],
        "vendor_id": vendor_id,
        "email": email,
        "full_name": full_name,
        "exp": now + timedelta(minutes=settings.JWT_EXPIRATION_MINUTES),
        "iat": now,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    """
    Decode and validate a JWT.

    Returns the payload dict on success, or None if the token is
    invalid / expired / tampered with.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError:
        return None
