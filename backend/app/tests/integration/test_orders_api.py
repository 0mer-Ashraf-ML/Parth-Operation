import pytest

from app.models.enums import POStatus, ShipmentType, UserRole
from app.tests.helpers import (
    add_tier_price,
    auth_headers_for,
    create_client,
    create_client_address,
    create_sku,
    create_user,
    create_vendor,
    link_sku_vendor,
)


pytestmark = pytest.mark.integration


def _seed_order_prereqs(db_session):
    admin = create_user(db_session, role=UserRole.ADMIN)
    client = create_client(db_session, company_name="Order Client")
    ship_to = create_client_address(db_session, client, label="Distribution Center")
    vendor = create_vendor(db_session, company_name="Factory Vendor")
    sku = create_sku(db_session, sku_code="80-0001", default_vendor=vendor)
    add_tier_price(db_session, sku, min_qty=1, max_qty=999, unit_price="3.25")
    link_sku_vendor(db_session, sku, vendor, is_default=True, vendor_cost="1.55")
    return admin, client, ship_to, vendor, sku


def test_generated_po_includes_full_ship_to_address_and_vendor_cost(client, db_session):
    admin, order_client, ship_to, vendor, sku = _seed_order_prereqs(db_session)
    headers = auth_headers_for(db_session, admin)

    so_response = client.post(
        "/sales-orders",
        headers=headers,
        json={
            "order_number": "SO-ADDR-001",
            "client_id": order_client.id,
            "ship_to_address_id": ship_to.id,
            "ship_to_contact_name": "Warehouse Receiver",
            "lines": [{"sku_id": sku.id, "ordered_qty": 12}],
        },
    )
    assert so_response.status_code == 201
    so_id = so_response.json()["data"]["id"]

    po_response = client.post(
        f"/sales-orders/{so_id}/generate-pos",
        headers=headers,
        json={"shipment_type": ShipmentType.DROP_SHIP.value},
    )
    assert po_response.status_code == 201
    po_data = po_response.json()["data"]["purchase_orders"][0]

    assert po_data["ship_to_address"]["label"] == "Distribution Center"
    assert po_data["ship_to_address"]["address_line_1"] == "123 Test Street"
    assert po_data["vendor_id"] == vendor.id
    assert po_data["lines"][0]["unit_cost"] == 1.55


def test_duplicate_po_generation_is_blocked(client, db_session):
    admin, order_client, ship_to, _vendor, sku = _seed_order_prereqs(db_session)
    headers = auth_headers_for(db_session, admin)
    so_response = client.post(
        "/sales-orders",
        headers=headers,
        json={
            "order_number": "SO-DUPE-001",
            "client_id": order_client.id,
            "ship_to_address_id": ship_to.id,
            "lines": [{"sku_id": sku.id, "ordered_qty": 5}],
        },
    )
    so_id = so_response.json()["data"]["id"]

    first = client.post(
        f"/sales-orders/{so_id}/generate-pos",
        headers=headers,
        json={"shipment_type": ShipmentType.DROP_SHIP.value},
    )
    assert first.status_code == 201

    second = client.post(
        f"/sales-orders/{so_id}/generate-pos",
        headers=headers,
        json={"shipment_type": ShipmentType.DROP_SHIP.value},
    )
    assert second.status_code == 409


def test_active_po_shipment_type_can_change_but_completed_po_cannot(client, db_session):
    admin, order_client, ship_to, _vendor, sku = _seed_order_prereqs(db_session)
    headers = auth_headers_for(db_session, admin)
    so_response = client.post(
        "/sales-orders",
        headers=headers,
        json={
            "order_number": "SO-SHIPTYPE-001",
            "client_id": order_client.id,
            "ship_to_address_id": ship_to.id,
            "lines": [{"sku_id": sku.id, "ordered_qty": 7}],
        },
    )
    so_id = so_response.json()["data"]["id"]
    po_response = client.post(
        f"/sales-orders/{so_id}/generate-pos",
        headers=headers,
        json={"shipment_type": ShipmentType.DROP_SHIP.value},
    )
    po = po_response.json()["data"]["purchase_orders"][0]
    po_id = po["id"]

    change_response = client.patch(
        f"/purchase-orders/{po_id}",
        headers=headers,
        json={"shipment_type": ShipmentType.IN_HOUSE.value},
    )
    assert change_response.status_code == 200
    assert change_response.json()["data"]["shipment_type"] == ShipmentType.IN_HOUSE.value

    complete_response = client.patch(
        f"/purchase-orders/{po_id}",
        headers=headers,
        json={"status": POStatus.COMPLETED.value},
    )
    assert complete_response.status_code == 200
    assert complete_response.json()["data"]["status"] == POStatus.COMPLETED.value

    blocked = client.patch(
        f"/purchase-orders/{po_id}",
        headers=headers,
        json={"shipment_type": ShipmentType.DROP_SHIP.value},
    )
    assert blocked.status_code == 400
