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


pytestmark = pytest.mark.e2e


def test_change_shipment_type_mid_flow_then_continue_processing(client, db_session):
    admin = create_user(db_session, role=UserRole.ADMIN)
    vendor = create_vendor(db_session, company_name="Stateful Vendor")
    vendor_user = create_user(db_session, role=UserRole.VENDOR, vendor=vendor)
    customer = create_client(db_session, company_name="Stateful Customer")
    ship_to = create_client_address(db_session, customer)
    sku = create_sku(
        db_session,
        sku_code="STATEFUL-SKU",
        default_vendor=vendor,
        track_inventory=True,
    )
    add_tier_price(db_session, sku, min_qty=1, max_qty=999, unit_price="6.00")
    link_sku_vendor(db_session, sku, vendor, is_default=True, vendor_cost="2.50")

    admin_headers = auth_headers_for(db_session, admin)
    vendor_headers = auth_headers_for(db_session, vendor_user)

    so = client.post(
        "/sales-orders",
        headers=admin_headers,
        json={
            "order_number": "SO-STATE-001",
            "client_id": customer.id,
            "ship_to_address_id": ship_to.id,
            "lines": [{"sku_id": sku.id, "ordered_qty": 10}],
        },
    )
    assert so.status_code == 201
    so_id = so.json()["data"]["id"]

    po_resp = client.post(
        f"/sales-orders/{so_id}/generate-pos",
        headers=admin_headers,
        json={"shipment_type": "drop_ship"},
    )
    assert po_resp.status_code == 201
    po = po_resp.json()["data"]["purchase_orders"][0]
    po_id = po["id"]
    line_id = po["lines"][0]["id"]

    packed = client.patch(
        f"/purchase-orders/{po_id}/lines/{line_id}",
        headers=vendor_headers,
        json={"status": "packed_and_shipped"},
    )
    assert packed.status_code == 200

    changed = client.patch(
        f"/purchase-orders/{po_id}",
        headers=admin_headers,
        json={"shipment_type": "in_house"},
    )
    assert changed.status_code == 200
    assert changed.json()["data"]["shipment_type"] == "in_house"

    ready = client.patch(
        f"/purchase-orders/{po_id}/lines/{line_id}",
        headers=vendor_headers,
        json={"status": "ready_for_pickup"},
    )
    assert ready.status_code == 200

    sku_after_receipt = client.get(f"/skus/{sku.id}", headers=admin_headers)
    assert sku_after_receipt.status_code == 200
    assert sku_after_receipt.json()["data"]["inventory_count"] == 10

    event = client.post(
        "/fulfillment/events",
        headers=vendor_headers,
        json={"po_line_id": line_id, "quantity": 4, "source": EventSource.UI.value},
    )
    assert event.status_code == 201

    delivered = client.patch(
        f"/purchase-orders/{po_id}/lines/{line_id}",
        headers=admin_headers,
        json={"status": "delivered"},
    )
    assert delivered.status_code == 200

    final_po = client.get(f"/purchase-orders/{po_id}", headers=admin_headers)
    final_so = client.get(f"/sales-orders/{so_id}", headers=admin_headers)
    final_sku = client.get(f"/skus/{sku.id}", headers=admin_headers)

    assert final_po.json()["data"]["status"] == "completed"
    assert final_po.json()["data"]["lines"][0]["status"] == "delivered"
    assert final_so.json()["data"]["status"] == "completed"
    assert final_sku.json()["data"]["inventory_count"] == 0


def test_two_pos_under_one_so_keep_so_partial_until_both_finish(client, db_session):
    admin = create_user(db_session, role=UserRole.ADMIN)
    vendor_a = create_vendor(db_session, company_name="Vendor A")
    vendor_b = create_vendor(db_session, company_name="Vendor B")
    vendor_a_user = create_user(db_session, role=UserRole.VENDOR, vendor=vendor_a)
    vendor_b_user = create_user(db_session, role=UserRole.VENDOR, vendor=vendor_b)
    customer = create_client(db_session, company_name="Multi Vendor Customer")
    ship_to = create_client_address(db_session, customer)

    sku_a = create_sku(db_session, sku_code="MULTI-A", default_vendor=vendor_a)
    sku_b = create_sku(db_session, sku_code="MULTI-B", default_vendor=vendor_b)
    add_tier_price(db_session, sku_a, min_qty=1, max_qty=999, unit_price="7.00")
    add_tier_price(db_session, sku_b, min_qty=1, max_qty=999, unit_price="9.00")
    link_sku_vendor(db_session, sku_a, vendor_a, is_default=True, vendor_cost="3.00")
    link_sku_vendor(db_session, sku_b, vendor_b, is_default=True, vendor_cost="4.00")

    admin_headers = auth_headers_for(db_session, admin)
    vendor_a_headers = auth_headers_for(db_session, vendor_a_user)
    vendor_b_headers = auth_headers_for(db_session, vendor_b_user)

    so = client.post(
        "/sales-orders",
        headers=admin_headers,
        json={
            "order_number": "SO-MULTI-001",
            "client_id": customer.id,
            "ship_to_address_id": ship_to.id,
            "lines": [
                {"sku_id": sku_a.id, "ordered_qty": 5},
                {"sku_id": sku_b.id, "ordered_qty": 8},
            ],
        },
    )
    assert so.status_code == 201
    so_id = so.json()["data"]["id"]

    pos = client.post(
        f"/sales-orders/{so_id}/generate-pos",
        headers=admin_headers,
        json={"shipment_type": "drop_ship"},
    )
    assert pos.status_code == 201
    po_items = pos.json()["data"]["purchase_orders"]
    assert len(po_items) == 2

    po_by_vendor = {po["vendor_id"]: po for po in po_items}
    po_a = po_by_vendor[vendor_a.id]
    po_b = po_by_vendor[vendor_b.id]

    for headers, po in ((vendor_a_headers, po_a), (vendor_b_headers, po_b)):
        assert client.patch(
            f"/purchase-orders/{po['id']}/lines/{po['lines'][0]['id']}",
            headers=headers,
            json={"status": "packed_and_shipped"},
        ).status_code == 200

    assert client.post(
        "/fulfillment/events",
        headers=vendor_a_headers,
        json={"po_line_id": po_a["lines"][0]["id"], "quantity": 5, "source": EventSource.UI.value},
    ).status_code == 201

    so_after_first = client.get(f"/sales-orders/{so_id}", headers=admin_headers)
    assert so_after_first.status_code == 200
    assert so_after_first.json()["data"]["status"] == "partially_completed"

    assert client.post(
        "/fulfillment/events",
        headers=vendor_b_headers,
        json={"po_line_id": po_b["lines"][0]["id"], "quantity": 8, "source": EventSource.UI.value},
    ).status_code == 201

    so_after_second = client.get(f"/sales-orders/{so_id}", headers=admin_headers)
    assert so_after_second.status_code == 200
    assert so_after_second.json()["data"]["status"] == "completed"
