from decimal import Decimal

import pytest

from app.models.enums import POLineStatus, ShipmentType, SOStatus, UserRole
from app.services.purchase_order import (
    derive_so_status,
    generate_pos_from_so,
    update_purchase_order,
)
from app.tests.helpers import (
    create_client,
    create_client_address,
    create_sales_order_direct,
    create_sku,
    create_user,
    create_vendor,
    current_user_for,
    link_sku_vendor,
)


pytestmark = pytest.mark.unit


def test_generate_pos_groups_lines_by_vendor_and_copies_vendor_cost(db_session):
    admin = create_user(db_session, role=UserRole.ADMIN)
    client = create_client(db_session)
    ship_to = create_client_address(db_session, client)
    vendor_a = create_vendor(db_session, company_name="Vendor A")
    vendor_b = create_vendor(db_session, company_name="Vendor B")

    sku_a = create_sku(db_session, sku_code="SKU-A", default_vendor=vendor_a)
    sku_b = create_sku(db_session, sku_code="SKU-B", default_vendor=vendor_b)
    link_sku_vendor(db_session, sku_a, vendor_a, is_default=True, vendor_cost="1.75")
    link_sku_vendor(db_session, sku_b, vendor_b, is_default=True, vendor_cost="2.50")

    so = create_sales_order_direct(
        db_session,
        creator=admin,
        client=client,
        ship_to_address=ship_to,
        sku=sku_a,
        ordered_qty=10,
    )
    so.lines.append(
        so.lines[0].__class__(
            sku_id=sku_b.id,
            line_number=2,
            ordered_qty=5,
            unit_price=Decimal("4.00"),
        )
    )
    db_session.commit()
    db_session.refresh(so)

    created = generate_pos_from_so(
        db_session,
        current_user_for(db_session, admin),
        so.id,
        shipment_type=ShipmentType.DROP_SHIP,
    )

    assert len(created) == 2
    line_costs = sorted(
        (line.sku_id, Decimal(str(line.unit_cost)))
        for po in created
        for line in po.lines
    )
    assert line_costs == sorted([
        (sku_a.id, Decimal("1.75")),
        (sku_b.id, Decimal("2.50")),
    ])


def test_active_purchase_order_shipment_type_can_change_but_completed_cannot(db_session):
    admin = create_user(db_session, role=UserRole.ADMIN)
    client = create_client(db_session)
    ship_to = create_client_address(db_session, client)
    vendor = create_vendor(db_session)
    sku = create_sku(db_session, default_vendor=vendor, track_inventory=True)
    link_sku_vendor(db_session, sku, vendor, is_default=True, vendor_cost="1.00")
    so = create_sales_order_direct(
        db_session,
        creator=admin,
        client=client,
        ship_to_address=ship_to,
        sku=sku,
        ordered_qty=8,
    )

    po = generate_pos_from_so(
        db_session,
        current_user_for(db_session, admin),
        so.id,
        shipment_type=ShipmentType.DROP_SHIP,
    )[0]

    updated = update_purchase_order(
        db_session,
        current_user_for(db_session, admin),
        po.id,
        shipment_type=ShipmentType.IN_HOUSE,
    )
    assert updated.shipment_type == ShipmentType.IN_HOUSE

    completed = update_purchase_order(
        db_session,
        current_user_for(db_session, admin),
        po.id,
        status=po.status.__class__.COMPLETED,
    )
    assert completed.status == completed.status.__class__.COMPLETED

    with pytest.raises(Exception):
        update_purchase_order(
            db_session,
            current_user_for(db_session, admin),
            po.id,
            shipment_type=ShipmentType.DROP_SHIP,
        )


def test_derive_so_status_moves_from_started_to_partial_to_completed(db_session):
    admin = create_user(db_session, role=UserRole.ADMIN)
    client = create_client(db_session)
    ship_to = create_client_address(db_session, client)
    vendor = create_vendor(db_session)
    sku = create_sku(db_session, default_vendor=vendor)
    link_sku_vendor(db_session, sku, vendor, is_default=True, vendor_cost="1.00")
    so = create_sales_order_direct(
        db_session,
        creator=admin,
        client=client,
        ship_to_address=ship_to,
        sku=sku,
        ordered_qty=6,
    )

    po = generate_pos_from_so(
        db_session,
        current_user_for(db_session, admin),
        so.id,
        shipment_type=ShipmentType.DROP_SHIP,
    )[0]
    line = po.lines[0]

    assert derive_so_status(db_session, so.id) == SOStatus.STARTED

    line.delivered_qty = 3
    line.status = POLineStatus.PACKED_AND_SHIPPED
    db_session.commit()
    assert derive_so_status(db_session, so.id) == SOStatus.PARTIALLY_COMPLETED

    line.delivered_qty = 6
    line.status = POLineStatus.DELIVERED
    db_session.commit()
    assert derive_so_status(db_session, so.id) == SOStatus.COMPLETED
