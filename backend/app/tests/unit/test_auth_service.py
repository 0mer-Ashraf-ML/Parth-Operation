import pytest

from app.models.enums import UserRole
from app.services.auth import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


pytestmark = pytest.mark.unit


def test_hash_password_round_trip():
    password = "StrongPass123!"
    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_access_token_round_trip_preserves_role_scope():
    token = create_access_token(
        user_id=42,
        role=UserRole.ACCOUNT_MANAGER.value,
        client_ids=[1, 7],
        vendor_id=None,
        email="am@example.com",
        full_name="AM User",
    )
    payload = decode_access_token(token)

    assert payload is not None
    assert payload["sub"] == "42"
    assert payload["role"] == UserRole.ACCOUNT_MANAGER.value
    assert payload["client_ids"] == [1, 7]
    assert payload["vendor_id"] is None
    assert payload["email"] == "am@example.com"
