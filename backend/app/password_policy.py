"""
Password rules for new passwords and password changes.

Login does not re-validate against this policy so existing accounts keep working.
"""

from __future__ import annotations

MIN_LENGTH = 10
MAX_LENGTH = 128


def validate_new_password(password: str) -> str:
    """
    Enforce client requirements: length, upper, lower, digit, special.

    A special character is any character that is not a letter or digit
    (Unicode-aware via str methods).

    Returns the password unchanged if valid; raises ValueError otherwise.
    """
    if len(password) < MIN_LENGTH:
        raise ValueError(f"Password must be at least {MIN_LENGTH} characters.")
    if len(password) > MAX_LENGTH:
        raise ValueError(f"Password must be at most {MAX_LENGTH} characters.")

    missing: list[str] = []
    if not any(c.isupper() for c in password):
        missing.append("one uppercase letter")
    if not any(c.islower() for c in password):
        missing.append("one lowercase letter")
    if not any(c.isdigit() for c in password):
        missing.append("one number")
    if not any(not c.isalnum() for c in password):
        missing.append("one special character (non-letter, non-digit)")

    if missing:
        need = ", ".join(missing)
        raise ValueError(f"Password must contain {need}.")

    return password
