"""
Shared request-validation helpers used by Pydantic schemas.
"""

from __future__ import annotations

import re


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_ALLOWED_PAYMENT_TERMS = {30, 45, 60, 90}


def normalize_email(value: str) -> str:
    return value.strip().lower()


def validate_email_like(value: str, *, field_name: str = "email") -> str:
    normalized = normalize_email(value)
    if not _EMAIL_RE.match(normalized):
        raise ValueError(f"{field_name} must be a valid email address")
    return normalized


def validate_optional_email_like(value: str | None, *, field_name: str = "email") -> str | None:
    if value is None:
        return None
    return validate_email_like(value, field_name=field_name)


def validate_payment_terms(value: int) -> int:
    if value not in _ALLOWED_PAYMENT_TERMS:
        raise ValueError("payment_terms must be one of: 30, 45, 60, 90")
    return value
