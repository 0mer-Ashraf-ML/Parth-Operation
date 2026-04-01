import pytest

from app.models.enums import EventSource, UserRole
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


def _seed_order_case(db_session):
    admin = create_user(db_session, role=UserRole.ADMIN)
    vendor = create_vendor(db_session, company_name="Edge Vendor")
    vendor_user = create_user(db_session, role=UserRole.VENDOR, vendor=vendor)
    customer = create_client(db_session, company_name="Edge Client")
    ship_to = create_client_address(db_session, customer)
    sku = create_sku(db_session, sku_code="EDGE-SKU", default_vendor=vendor, track_inventory=True)
    add_tier_price(db_session, sku, min_qty=1, max_qty=999, unit_price="4.25")
    link_sku_vendor(db_session, sku, vendor, is_default=True, vendor_cost="1.95")
    return admin, vendor, vendor_user, customer, ship_to, sku


def _create_so_and_po(client, db_session):
    admin, vendor, vendor_user, customer, ship_to, sku = _seed_order_case(db_session)
    admin_headers = auth_headers_for(db_session, admin)
    vendor_headers = auth_headers_for(db_session, vendor_user)

    so_response = client.post(
        "/sales-orders",
        headers=admin_headers,
        json={
            "order_number": "SO-EDGE-001",
            "client_id": customer.id,
            "ship_to_address_id": ship_to.id,
            "lines": [{"sku_id": sku.id, "ordered_qty": 10}],
        },
    )
    assert so_response.status_code == 201
    so_id = so_response.json()["data"]["id"]

    po_response = client.post(
        f"/sales-orders/{so_id}/generate-pos",
        headers=admin_headers,
        json={"shipment_type": "in_house"},
    )
    assert po_response.status_code == 201
    po = po_response.json()["data"]["purchase_orders"][0]
    return admin, vendor, vendor_user, sku, so_id, po["id"], po["lines"][0]["id"], admin_headers, vendor_headers


def test_inactive_sku_cannot_be_used_to_create_or_extend_sales_orders(client, db_session):
    admin = create_user(db_session, role=UserRole.ADMIN)
    customer = create_client(db_session)
    ship_to = create_client_address(db_session, customer)
    vendor = create_vendor(db_session)
    active_sku = create_sku(db_session, sku_code="ACTIVE-SKU", default_vendor=vendor)
    inactive_sku = create_sku(
        db_session,
        sku_code="INACTIVE-SKU",
        default_vendor=vendor,
        is_active=False,
    )
    add_tier_price(db_session, active_sku, min_qty=1, max_qty=999, unit_price="3.00")
    link_sku_vendor(db_session, active_sku, vendor, is_default=True, vendor_cost="1.00")
    link_sku_vendor(db_session, inactive_sku, vendor, is_default=True, vendor_cost="1.00")

    headers = auth_headers_for(db_session, admin)

    create_response = client.post(
        "/sales-orders",
        headers=headers,
        json={
            "order_number": "SO-INACTIVE-001",
            "client_id": customer.id,
            "ship_to_address_id": ship_to.id,
            "lines": [{"sku_id": inactive_sku.id, "ordered_qty": 2, "unit_price": 3.00}],
        },
    )
    assert create_response.status_code == 400

    so_response = client.post(
        "/sales-orders",
        headers=headers,
        json={
            "order_number": "SO-INACTIVE-002",
            "client_id": customer.id,
            "ship_to_address_id": ship_to.id,
            "lines": [{"sku_id": active_sku.id, "ordered_qty": 2}],
        },
    )
    assert so_response.status_code == 201
    so_id = so_response.json()["data"]["id"]

    add_line_response = client.post(
        f"/sales-orders/{so_id}/lines",
        headers=headers,
        json={"sku_id": inactive_sku.id, "ordered_qty": 1, "unit_price": 2.50},
    )
    assert add_line_response.status_code == 400


def test_cannot_delete_sales_order_line_once_po_line_exists(client, db_session):
    admin, _vendor, _vendor_user, _sku, so_id, _po_id, _line_id, admin_headers, _vendor_headers = _create_so_and_po(
        client, db_session
    )

    so_detail = client.get(f"/sales-orders/{so_id}", headers=admin_headers)
    so_line_id = so_detail.json()["data"]["lines"][0]["id"]

    response = client.delete(
        f"/sales-orders/{so_id}/lines/{so_line_id}",
        headers=admin_headers,
    )
    assert response.status_code == 400


def test_vendor_reassignment_refreshes_po_line_unit_costs(client, db_session):
    admin, vendor_a, _vendor_user, sku, _so_id, po_id, _po_line_id, admin_headers, _vendor_headers = _create_so_and_po(
        client, db_session
    )
    vendor_b = create_vendor(db_session, company_name="Replacement Vendor")
    link_sku_vendor(db_session, sku, vendor_b, is_default=False, vendor_cost="2.45")

    response = client.patch(
        f"/purchase-orders/{po_id}",
        headers=admin_headers,
        json={"vendor_id": vendor_b.id},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["vendor_id"] == vendor_b.id
    assert data["lines"][0]["unit_cost"] == 2.45
    assert data["vendor_id"] != vendor_a.id


def test_cannot_reduce_delivered_qty_below_recorded_events_total(client, db_session):
    admin, _vendor, vendor_user, _sku, _so_id, po_id, po_line_id, admin_headers, vendor_headers = _create_so_and_po(
        client, db_session
    )

    packed = client.patch(
        f"/purchase-orders/{po_id}/lines/{po_line_id}",
        headers=vendor_headers,
        json={"status": "packed_and_shipped"},
    )
    assert packed.status_code == 200

    ready = client.patch(
        f"/purchase-orders/{po_id}/lines/{po_line_id}",
        headers=vendor_headers,
        json={"status": "ready_for_pickup"},
    )
    assert ready.status_code == 200

    event = client.post(
        "/fulfillment/events",
        headers=vendor_headers,
        json={"po_line_id": po_line_id, "quantity": 4, "source": EventSource.UI.value},
    )
    assert event.status_code == 201

    response = client.patch(
        f"/purchase-orders/{po_id}/lines/{po_line_id}",
        headers=admin_headers,
        json={"delivered_qty": 3},
    )
    assert response.status_code == 400


def test_vendor_cannot_mark_in_house_line_delivered_but_admin_can(client, db_session):
    admin, _vendor, vendor_user, _sku, _so_id, po_id, po_line_id, admin_headers, vendor_headers = _create_so_and_po(
        client, db_session
    )

    assert client.patch(
        f"/purchase-orders/{po_id}/lines/{po_line_id}",
        headers=vendor_headers,
        json={"status": "packed_and_shipped"},
    ).status_code == 200

    assert client.patch(
        f"/purchase-orders/{po_id}/lines/{po_line_id}",
        headers=vendor_headers,
        json={"status": "ready_for_pickup"},
    ).status_code == 200

    vendor_attempt = client.patch(
        f"/purchase-orders/{po_id}/lines/{po_line_id}",
        headers=vendor_headers,
        json={"status": "delivered"},
    )
    assert vendor_attempt.status_code == 403

    admin_attempt = client.patch(
        f"/purchase-orders/{po_id}/lines/{po_line_id}",
        headers=admin_headers,
        json={"status": "delivered"},
    )
    assert admin_attempt.status_code == 200


def test_over_delivery_is_blocked_after_multiple_valid_fulfillment_events(client, db_session):
    _admin, _vendor, vendor_user, _sku, _so_id, po_id, po_line_id, _admin_headers, vendor_headers = _create_so_and_po(
        client, db_session
    )

    assert client.patch(
        f"/purchase-orders/{po_id}/lines/{po_line_id}",
        headers=vendor_headers,
        json={"status": "packed_and_shipped"},
    ).status_code == 200

    assert client.patch(
        f"/purchase-orders/{po_id}/lines/{po_line_id}",
        headers=vendor_headers,
        json={"status": "ready_for_pickup"},
    ).status_code == 200

    for qty in (3, 4, 3):
        response = client.post(
            "/fulfillment/events",
            headers=vendor_headers,
            json={"po_line_id": po_line_id, "quantity": qty, "source": EventSource.UI.value},
        )
        assert response.status_code == 201

    overflow = client.post(
        "/fulfillment/events",
        headers=vendor_headers,
        json={"po_line_id": po_line_id, "quantity": 1, "source": EventSource.UI.value},
    )
    assert overflow.status_code == 400
