import pytest

from app.models.enums import UserRole
from app.tests.helpers import (
    add_tier_price,
    assign_client_to_am,
    auth_headers_for,
    create_client,
    create_sku,
    create_user,
    create_vendor,
    link_sku_vendor,
)


pytestmark = pytest.mark.integration


def test_account_manager_only_sees_assigned_clients(client, db_session):
    admin = create_user(db_session, role=UserRole.ADMIN)
    am = create_user(db_session, role=UserRole.ACCOUNT_MANAGER)
    assigned = create_client(db_session, company_name="Assigned Client")
    unassigned = create_client(db_session, company_name="Unassigned Client")
    assign_client_to_am(db_session, am, assigned)

    response = client.get("/clients", headers=auth_headers_for(db_session, am))
    assert response.status_code == 200
    names = {row["company_name"] for row in response.json()["data"]}
    assert "Assigned Client" in names
    assert "Unassigned Client" not in names

    create_response = client.post(
        "/clients",
        headers=auth_headers_for(db_session, admin),
        json={
            "company_name": "Created Through API",
            "payment_terms": 30,
            "addresses": [],
            "contacts": [],
        },
    )
    assert create_response.status_code == 201


def test_vendor_can_only_view_their_own_vendor_record(client, db_session):
    own_vendor = create_vendor(db_session, company_name="Own Vendor")
    other_vendor = create_vendor(db_session, company_name="Other Vendor")
    vendor_user = create_user(db_session, role=UserRole.VENDOR, vendor=own_vendor)
    headers = auth_headers_for(db_session, vendor_user)

    list_response = client.get("/vendors", headers=headers)
    assert list_response.status_code == 200
    vendors = list_response.json()["data"]
    assert len(vendors) == 1
    assert vendors[0]["id"] == own_vendor.id

    forbidden = client.get(f"/vendors/{other_vendor.id}", headers=headers)
    assert forbidden.status_code == 403


def test_vendor_sku_detail_hides_tier_pricing(client, db_session):
    vendor = create_vendor(db_session)
    vendor_user = create_user(db_session, role=UserRole.VENDOR, vendor=vendor)
    sku = create_sku(db_session, default_vendor=vendor)
    add_tier_price(db_session, sku, min_qty=1, max_qty=99, unit_price="3.50")
    link_sku_vendor(db_session, sku, vendor, is_default=True, vendor_cost="1.80")

    response = client.get(f"/skus/{sku.id}", headers=auth_headers_for(db_session, vendor_user))
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["sku_vendors"][0]["vendor_cost"] == "1.80"
    assert data["tier_prices"] == []
