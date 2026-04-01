import pytest

from app.models.enums import UserRole
from app.tests.helpers import (
    DEFAULT_PASSWORD,
    assign_client_to_am,
    auth_headers_for,
    create_client,
    create_client_address,
    create_sku,
    create_user,
    create_vendor,
    link_sku_vendor,
)


pytestmark = pytest.mark.integration


def test_cannot_create_second_active_admin_via_api(client, db_session):
    admin = create_user(
        db_session,
        role=UserRole.ADMIN,
        email="root-admin@example.com",
        password=DEFAULT_PASSWORD,
    )

    response = client.post(
        "/users",
        headers=auth_headers_for(db_session, admin),
        json={
            "email": "second-admin@example.com",
            "password": DEFAULT_PASSWORD,
            "full_name": "Second Admin",
            "role": UserRole.ADMIN.value,
        },
    )

    assert response.status_code == 409
    assert response.json()["success"] is False


def test_admin_cannot_change_own_role_or_deactivate_self(client, db_session):
    admin = create_user(db_session, role=UserRole.ADMIN, email="self-admin@example.com")
    headers = auth_headers_for(db_session, admin)

    role_response = client.patch(
        f"/users/{admin.id}/role",
        headers=headers,
        json={"role": UserRole.ACCOUNT_MANAGER.value},
    )
    assert role_response.status_code == 403

    delete_response = client.delete(f"/users/{admin.id}", headers=headers)
    assert delete_response.status_code == 403


def test_am_cannot_access_unassigned_sales_orders_or_purchase_orders(client, db_session):
    admin = create_user(db_session, role=UserRole.ADMIN)
    am = create_user(db_session, role=UserRole.ACCOUNT_MANAGER)
    client_a = create_client(db_session, company_name="Client A")
    client_b = create_client(db_session, company_name="Client B")
    assign_client_to_am(db_session, am, client_a)

    addr_b = create_client_address(db_session, client_b)
    vendor = create_vendor(db_session)
    sku = create_sku(db_session, default_vendor=vendor)
    link_sku_vendor(db_session, sku, vendor, is_default=True, vendor_cost="1.20")

    admin_headers = auth_headers_for(db_session, admin)
    am_headers = auth_headers_for(db_session, am)

    so_response = client.post(
        "/sales-orders",
        headers=admin_headers,
        json={
            "order_number": "SO-SCOPE-001",
            "client_id": client_b.id,
            "ship_to_address_id": addr_b.id,
            "lines": [{"sku_id": sku.id, "ordered_qty": 5, "unit_price": 3.10}],
        },
    )
    assert so_response.status_code == 201
    so_id = so_response.json()["data"]["id"]

    so_forbidden = client.get(f"/sales-orders/{so_id}", headers=am_headers)
    assert so_forbidden.status_code == 403

    po_response = client.post(
        f"/sales-orders/{so_id}/generate-pos",
        headers=admin_headers,
        json={"shipment_type": "drop_ship"},
    )
    assert po_response.status_code == 201
    po_id = po_response.json()["data"]["purchase_orders"][0]["id"]

    po_forbidden = client.get(f"/purchase-orders/{po_id}", headers=am_headers)
    assert po_forbidden.status_code == 403
