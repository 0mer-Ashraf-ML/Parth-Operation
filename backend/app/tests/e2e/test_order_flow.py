import pytest

from app.models.enums import EventSource, ShipmentType, UserRole
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


def _seed_flow(db_session, *, shipment_type: ShipmentType, track_inventory: bool = False):
    admin = create_user(db_session, role=UserRole.ADMIN)
    vendor = create_vendor(db_session, company_name="Flow Vendor")
    vendor_user = create_user(db_session, role=UserRole.VENDOR, vendor=vendor)
    customer = create_client(db_session, company_name="Flow Client")
    ship_to = create_client_address(db_session, customer)
    sku = create_sku(
        db_session,
        sku_code="FLOW-SKU",
        default_vendor=vendor,
        track_inventory=track_inventory,
        inventory_count=0,
    )
    add_tier_price(db_session, sku, min_qty=1, max_qty=999, unit_price="5.00")
    link_sku_vendor(db_session, sku, vendor, is_default=True, vendor_cost="2.10")
    return admin, vendor_user, customer, ship_to, sku, shipment_type


def test_drop_ship_flow_updates_po_and_so_status_from_fulfillment_events(client, db_session):
    admin, vendor_user, customer, ship_to, sku, shipment_type = _seed_flow(
        db_session,
        shipment_type=ShipmentType.DROP_SHIP,
    )
    admin_headers = auth_headers_for(db_session, admin)
    vendor_headers = auth_headers_for(db_session, vendor_user)

    so_response = client.post(
        "/sales-orders",
        headers=admin_headers,
        json={
            "order_number": "SO-E2E-DROP-001",
            "client_id": customer.id,
            "ship_to_address_id": ship_to.id,
            "lines": [{"sku_id": sku.id, "ordered_qty": 10}],
        },
    )
    so_id = so_response.json()["data"]["id"]

    po_response = client.post(
        f"/sales-orders/{so_id}/generate-pos",
        headers=admin_headers,
        json={"shipment_type": shipment_type.value},
    )
    po = po_response.json()["data"]["purchase_orders"][0]
    po_id = po["id"]
    po_line_id = po["lines"][0]["id"]

    partial = client.post(
        "/fulfillment/events",
        headers=vendor_headers,
        json={
            "po_line_id": po_line_id,
            "quantity": 4,
            "source": EventSource.UI.value,
        },
    )
    assert partial.status_code == 201

    po_detail = client.get(f"/purchase-orders/{po_id}", headers=admin_headers)
    assert po_detail.status_code == 200
    assert po_detail.json()["data"]["status"] == "started"
    assert po_detail.json()["data"]["lines"][0]["delivered_qty"] == 4

    so_detail = client.get(f"/sales-orders/{so_id}", headers=admin_headers)
    assert so_detail.status_code == 200
    assert so_detail.json()["data"]["status"] == "partially_completed"

    final = client.post(
        "/fulfillment/events",
        headers=vendor_headers,
        json={
            "po_line_id": po_line_id,
            "quantity": 6,
            "source": EventSource.UI.value,
        },
    )
    assert final.status_code == 201

    po_detail = client.get(f"/purchase-orders/{po_id}", headers=admin_headers)
    so_detail = client.get(f"/sales-orders/{so_id}", headers=admin_headers)
    assert po_detail.json()["data"]["status"] == "completed"
    assert po_detail.json()["data"]["lines"][0]["status"] == "delivered"
    assert so_detail.json()["data"]["status"] == "completed"


def test_in_house_receipt_and_delivery_adjust_inventory(client, db_session):
    admin, vendor_user, customer, ship_to, sku, shipment_type = _seed_flow(
        db_session,
        shipment_type=ShipmentType.IN_HOUSE,
        track_inventory=True,
    )
    admin_headers = auth_headers_for(db_session, admin)
    vendor_headers = auth_headers_for(db_session, vendor_user)

    so_response = client.post(
        "/sales-orders",
        headers=admin_headers,
        json={
            "order_number": "SO-E2E-INHOUSE-001",
            "client_id": customer.id,
            "ship_to_address_id": ship_to.id,
            "lines": [{"sku_id": sku.id, "ordered_qty": 10}],
        },
    )
    so_id = so_response.json()["data"]["id"]

    po_response = client.post(
        f"/sales-orders/{so_id}/generate-pos",
        headers=admin_headers,
        json={"shipment_type": shipment_type.value},
    )
    po = po_response.json()["data"]["purchase_orders"][0]
    po_id = po["id"]
    line_id = po["lines"][0]["id"]

    packed = client.patch(
        f"/purchase-orders/{po_id}/lines/{line_id}",
        headers=vendor_headers,
        json={"status": "packed_and_shipped"},
    )
    assert packed.status_code == 200

    ready = client.patch(
        f"/purchase-orders/{po_id}/lines/{line_id}",
        headers=vendor_headers,
        json={"status": "ready_for_pickup"},
    )
    assert ready.status_code == 200

    sku_detail = client.get(f"/skus/{sku.id}", headers=admin_headers)
    assert sku_detail.status_code == 200
    assert sku_detail.json()["data"]["inventory_count"] == 10

    partial_event = client.post(
        "/fulfillment/events",
        headers=vendor_headers,
        json={
            "po_line_id": line_id,
            "quantity": 4,
            "source": EventSource.UI.value,
        },
    )
    assert partial_event.status_code == 201

    sku_detail = client.get(f"/skus/{sku.id}", headers=admin_headers)
    assert sku_detail.json()["data"]["inventory_count"] == 6

    delivered = client.patch(
        f"/purchase-orders/{po_id}/lines/{line_id}",
        headers=admin_headers,
        json={"status": "delivered"},
    )
    assert delivered.status_code == 200
    assert delivered.json()["data"]["delivered_qty"] == 10

    sku_detail = client.get(f"/skus/{sku.id}", headers=admin_headers)
    po_detail = client.get(f"/purchase-orders/{po_id}", headers=admin_headers)
    so_detail = client.get(f"/sales-orders/{so_id}", headers=admin_headers)

    assert sku_detail.json()["data"]["inventory_count"] == 0
    assert po_detail.json()["data"]["status"] == "completed"
    assert so_detail.json()["data"]["status"] == "completed"
