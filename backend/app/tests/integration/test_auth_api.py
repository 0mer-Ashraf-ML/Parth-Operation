import pytest

from app.models.enums import UserRole
from app.tests.helpers import DEFAULT_PASSWORD, auth_headers_for, create_user


pytestmark = pytest.mark.integration


def test_login_returns_token_and_me_returns_identity(client, db_session):
    user = create_user(
        db_session,
        role=UserRole.ADMIN,
        email="admin@example.com",
        password=DEFAULT_PASSWORD,
    )

    response = client.post(
        "/auth/login",
        json={"email": user.email, "password": DEFAULT_PASSWORD},
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["access_token"]
    assert payload["user"]["role"] == UserRole.ADMIN.value

    me_response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {payload['access_token']}"},
    )
    assert me_response.status_code == 200
    me_data = me_response.json()["data"]
    assert me_data["user_id"] == user.id
    assert me_data["email"] == user.email


def test_inactive_user_cannot_log_in(client, db_session):
    user = create_user(
        db_session,
        role=UserRole.ADMIN,
        email="inactive@example.com",
        password=DEFAULT_PASSWORD,
        is_active=False,
    )

    response = client.post(
        "/auth/login",
        json={"email": user.email, "password": DEFAULT_PASSWORD},
    )
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_refresh_reloads_assignment_scope(client, db_session):
    am = create_user(db_session, role=UserRole.ACCOUNT_MANAGER, email="am@example.com")
    headers = auth_headers_for(db_session, am)

    response = client.post("/auth/refresh", headers=headers)
    assert response.status_code == 200
    assert response.json()["data"]["user"]["client_ids"] == []
