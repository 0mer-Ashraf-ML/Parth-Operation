"""
Comprehensive Purchase Order API Test Script
=============================================
Tests ALL PO endpoints with Admin, Account Manager, and Vendor roles.

Covers:
  - PO generation from Sales Order (auto-split by vendor)
  - PO list, detail, update, delete
  - PO line update
  - Status transitions (Drop-Ship + In-House flows)
  - Shipment type change constraints
  - Role-based access control (Admin, AM, Vendor)
  - Filter & search functionality
  - Error cases (duplicate, invalid transition, 404, 403, etc.)

Run:
    python test_po_api.py
"""

import datetime
import json
import sys
import time

import requests

BASE = "http://localhost:8000"
PASS_MARK = " [PASS]"
FAIL_MARK = " [FAIL]"
SKIP_MARK = " [SKIP]"
SEPARATOR = "=" * 72

# ── Credentials ────────────────────────────────────────────
ADMIN_CREDS  = {"email": "admin@gmail.com", "password": "admin123"}
AM_CREDS     = {"email": "am@gmail.com",    "password": "am123"}
VENDOR_CREDS = {"email": "vendor@gmail.com", "password": "vendor123"}

# ── Test state (populated during run) ──────────────────────
tokens:  dict[str, str] = {}
state:   dict[str, any] = {}
results: list[tuple[str, bool, str]] = []
test_num = 0


# ═══════════════════════════════════════════════════════════
#  UTILITIES
# ═══════════════════════════════════════════════════════════

def log(msg: str):
    """Safe print (handles Unicode on Windows)."""
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode())


def record(name: str, passed: bool, detail: str = ""):
    global test_num
    test_num += 1
    mark = PASS_MARK if passed else FAIL_MARK
    results.append((f"T{test_num:02d}: {name}", passed, detail))
    log(f"  T{test_num:02d}{mark} {name}" + (f"  -- {detail}" if detail else ""))
    if not passed:
        log(f"         DETAIL: {detail}")


def login(role_label: str, creds: dict) -> str:
    """Login and return the access token."""
    r = requests.post(f"{BASE}/auth/login", json=creds)
    assert r.status_code == 200, f"Login failed for {role_label}: {r.status_code} {r.text}"
    data = r.json()
    token = data["data"]["access_token"]
    log(f"  Logged in as {role_label} ({creds['email']})")
    return token


def h(token: str) -> dict:
    """Build Authorization header."""
    return {"Authorization": f"Bearer {token}"}


def safe_json(r) -> dict:
    try:
        return r.json()
    except Exception:
        return {"raw": r.text[:500]}


# ═══════════════════════════════════════════════════════════
#  SETUP: Create prerequisite data (vendors, client, SKUs, SO)
# ═══════════════════════════════════════════════════════════

def setup_test_data():
    """Create all prerequisite data for PO testing with Admin token."""
    log("\n" + SEPARATOR)
    log("PHASE 0: SETUP -- Creating prerequisite data")
    log(SEPARATOR)

    admin = tokens["admin"]

    # ── Two vendors (so PO generation creates 2 POs) ──────
    vendor_a_id = _find_or_create_vendor(admin, "PO-Test Vendor Alpha", "alpha@test.com")
    vendor_b_id = _find_or_create_vendor(admin, "PO-Test Vendor Beta", "beta@test.com")
    state["vendor_a_id"] = vendor_a_id
    state["vendor_b_id"] = vendor_b_id
    log(f"  Vendor A id={vendor_a_id}, Vendor B id={vendor_b_id}")

    # ── Client (use the AM-assigned TestClient LLC) ───────
    r = requests.get(f"{BASE}/clients", headers=h(admin))
    clients = r.json()["data"]
    # Find TestClient LLC (the one assigned to AM)
    am_client = next((c for c in clients if c["company_name"] == "TestClient LLC"), None)
    if am_client is None:
        # Fallback: create one
        r = requests.post(f"{BASE}/clients", headers=h(admin), json={
            "company_name": "TestClient LLC", "payment_terms": 30
        })
        am_client = r.json()["data"]
    state["am_client_id"] = am_client["id"]
    log(f"  AM Client (TestClient LLC) id={am_client['id']}")

    # Create a SECOND client that AM is NOT assigned to
    second_client_id = _find_or_create_client(admin, "PO-Test NonAssigned Corp")
    state["non_assigned_client_id"] = second_client_id
    log(f"  Non-assigned Client id={second_client_id}")

    # ── SKUs with vendor assignments ──────────────────────
    ts = datetime.datetime.now().strftime("%H%M%S")
    sku_a1_id = _find_or_create_sku(admin, f"PO-SKU-A1-{ts}", "PO Test SKU A1", vendor_a_id)
    sku_a2_id = _find_or_create_sku(admin, f"PO-SKU-A2-{ts}", "PO Test SKU A2", vendor_a_id)
    sku_b1_id = _find_or_create_sku(admin, f"PO-SKU-B1-{ts}", "PO Test SKU B1", vendor_b_id)
    state["sku_a1_id"] = sku_a1_id
    state["sku_a2_id"] = sku_a2_id
    state["sku_b1_id"] = sku_b1_id
    log(f"  SKU A1={sku_a1_id}, SKU A2={sku_a2_id}, SKU B1={sku_b1_id}")

    # ── Sales Order (AM client, 3 lines: 2 for Vendor A, 1 for Vendor B) ──
    so_number = f"SO-POTEST-{ts}"
    r = requests.post(f"{BASE}/sales-orders", headers=h(admin), json={
        "order_number": so_number,
        "client_id": state["am_client_id"],
        "order_date": "2026-03-12",
        "due_date": "2026-04-30",
        "notes": "PO test SO",
        "lines": [
            {"sku_id": sku_a1_id, "ordered_qty": 100, "unit_price": "5.00", "due_date": "2026-04-15"},
            {"sku_id": sku_a2_id, "ordered_qty": 200, "unit_price": "3.50", "due_date": "2026-04-20"},
            {"sku_id": sku_b1_id, "ordered_qty": 150, "unit_price": "7.25", "due_date": "2026-04-25"},
        ],
    })
    assert r.status_code == 201, f"SO creation failed: {r.status_code} {r.text}"
    so_data = r.json()["data"]
    state["so_id"] = so_data["id"]
    state["so_number"] = so_data["order_number"]
    log(f"  Sales Order '{so_data['order_number']}' id={so_data['id']} with {len(so_data['lines'])} lines")

    # ── Second SO on Non-Assigned client (for AM permission tests) ──
    so2_number = f"SO-NOAM-{ts}"
    r = requests.post(f"{BASE}/sales-orders", headers=h(admin), json={
        "order_number": so2_number,
        "client_id": state["non_assigned_client_id"],
        "lines": [
            {"sku_id": sku_a1_id, "ordered_qty": 50, "unit_price": "5.00"},
        ],
    })
    assert r.status_code == 201, f"SO2 creation failed: {r.status_code} {r.text}"
    so2_data = r.json()["data"]
    state["so2_id"] = so2_data["id"]
    state["so2_number"] = so2_data["order_number"]
    log(f"  Non-assigned SO '{so2_data['order_number']}' id={so2_data['id']}")

    # Generate POs for the non-assigned SO too (for cross-role tests)
    r = requests.post(f"{BASE}/sales-orders/{state['so2_id']}/generate-pos",
                      headers=h(admin), json={"shipment_type": "drop_ship"})
    assert r.status_code == 201, f"PO gen for SO2 failed: {r.status_code} {r.text}"
    non_assigned_pos = r.json()["data"]["purchase_orders"]
    state["non_assigned_po_id"] = non_assigned_pos[0]["id"]
    log(f"  Non-assigned PO id={state['non_assigned_po_id']}")

    log("  SETUP COMPLETE\n")


def _find_or_create_vendor(token: str, name: str, email: str) -> int:
    """Return vendor ID, creating if needed."""
    r = requests.get(f"{BASE}/vendors", headers=h(token))
    for v in r.json()["data"]:
        if v["company_name"] == name:
            return v["id"]
    r = requests.post(f"{BASE}/vendors", headers=h(token), json={
        "company_name": name, "contact_name": "Test", "email": email
    })
    if r.status_code == 201:
        return r.json()["data"]["id"]
    # Might already exist
    r = requests.get(f"{BASE}/vendors", headers=h(token))
    for v in r.json()["data"]:
        if v["company_name"] == name:
            return v["id"]
    raise RuntimeError(f"Cannot create/find vendor '{name}': {r.text}")


def _find_or_create_client(token: str, name: str) -> int:
    r = requests.get(f"{BASE}/clients", headers=h(token))
    for c in r.json()["data"]:
        if c["company_name"] == name:
            return c["id"]
    r = requests.post(f"{BASE}/clients", headers=h(token), json={
        "company_name": name, "payment_terms": 30
    })
    if r.status_code == 201:
        return r.json()["data"]["id"]
    r = requests.get(f"{BASE}/clients", headers=h(token))
    for c in r.json()["data"]:
        if c["company_name"] == name:
            return c["id"]
    raise RuntimeError(f"Cannot create/find client '{name}': {r.text}")


def _find_or_create_sku(token: str, code: str, name: str, vendor_id: int) -> int:
    """Create SKU with default_vendor_id set."""
    r = requests.get(f"{BASE}/skus", headers=h(token))
    for s in r.json()["data"]:
        if s["sku_code"] == code:
            return s["id"]
    r = requests.post(f"{BASE}/skus", headers=h(token), json={
        "sku_code": code,
        "name": name,
        "default_vendor_id": vendor_id,
        "tier_prices": [
            {"min_qty": 1, "max_qty": 999, "unit_price": "5.00"},
            {"min_qty": 1000, "unit_price": "4.00"},
        ],
    })
    assert r.status_code == 201, f"SKU creation failed for {code}: {r.status_code} {r.text}"
    sku_id = r.json()["data"]["id"]

    # Also link vendor via SKU-Vendor with is_default=true
    requests.post(f"{BASE}/skus/{sku_id}/vendors", headers=h(token), json={
        "vendor_id": vendor_id, "is_default": True
    })
    return sku_id


# ═══════════════════════════════════════════════════════════
#  PHASE 1: ADMIN -- PO GENERATION
# ═══════════════════════════════════════════════════════════

def test_phase1_admin_po_generation():
    log("\n" + SEPARATOR)
    log("PHASE 1: ADMIN -- PO Generation from Sales Order")
    log(SEPARATOR)

    admin = tokens["admin"]

    # T01: Generate POs (drop_ship)
    r = requests.post(
        f"{BASE}/sales-orders/{state['so_id']}/generate-pos",
        headers=h(admin),
        json={"shipment_type": "drop_ship"},
    )
    ok = r.status_code == 201
    if ok:
        data = r.json()["data"]
        pos = data["purchase_orders"]
        state["generated_po_ids"] = [po["id"] for po in pos]
        state["po_count"] = len(pos)
        # Store detail for later tests
        for po in pos:
            if po["vendor_id"] == state["vendor_a_id"]:
                state["po_a_id"] = po["id"]
                state["po_a_number"] = po["po_number"]
                state["po_a_line_ids"] = [ln["id"] for ln in po["lines"]]
            elif po["vendor_id"] == state["vendor_b_id"]:
                state["po_b_id"] = po["id"]
                state["po_b_number"] = po["po_number"]
                state["po_b_line_ids"] = [ln["id"] for ln in po["lines"]]
        detail = f"{len(pos)} POs created: {[po['po_number'] for po in pos]}"
    else:
        detail = f"Status {r.status_code}: {safe_json(r)}"
    record("Admin: Generate POs from SO (drop_ship)", ok, detail)

    # T02: Verify 2 POs were created (one per vendor)
    ok = state.get("po_count") == 2
    record("Verify 2 POs created (1 per vendor)", ok,
           f"Expected 2, got {state.get('po_count', 0)}")

    # T03: Verify PO-A has 2 lines (both SKU A1 and A2)
    ok = len(state.get("po_a_line_ids", [])) == 2
    record("PO-A has 2 lines (Vendor Alpha SKUs)", ok,
           f"lines={len(state.get('po_a_line_ids', []))}")

    # T04: Verify PO-B has 1 line (SKU B1)
    ok = len(state.get("po_b_line_ids", [])) == 1
    record("PO-B has 1 line (Vendor Beta SKU)", ok,
           f"lines={len(state.get('po_b_line_ids', []))}")

    # T05: PO number format check
    expected_a = f"PO-{state['so_number']}-A"
    expected_b = f"PO-{state['so_number']}-B"
    nums = {state.get("po_a_number"), state.get("po_b_number")}
    ok = expected_a in nums and expected_b in nums
    record("PO number format: PO-{SO}-A, PO-{SO}-B", ok,
           f"Got: {nums}")

    # T06: All POs start as IN_PRODUCTION
    r = requests.get(f"{BASE}/purchase-orders/{state['po_a_id']}", headers=h(admin))
    status_a = r.json()["data"]["status"] if r.status_code == 200 else "?"
    r2 = requests.get(f"{BASE}/purchase-orders/{state['po_b_id']}", headers=h(admin))
    status_b = r2.json()["data"]["status"] if r2.status_code == 200 else "?"
    ok = status_a == "in_production" and status_b == "in_production"
    record("Initial PO status = in_production", ok,
           f"PO-A={status_a}, PO-B={status_b}")

    # T07: All POs are drop_ship
    type_a = r.json()["data"]["shipment_type"] if r.status_code == 200 else "?"
    type_b = r2.json()["data"]["shipment_type"] if r2.status_code == 200 else "?"
    ok = type_a == "drop_ship" and type_b == "drop_ship"
    record("Shipment type = drop_ship", ok, f"PO-A={type_a}, PO-B={type_b}")

    # T08: is_deletable = True (IN_PRODUCTION)
    deletable_a = r.json()["data"].get("is_deletable", False)
    deletable_b = r2.json()["data"].get("is_deletable", False)
    ok = deletable_a and deletable_b
    record("is_deletable=True for IN_PRODUCTION POs", ok,
           f"PO-A={deletable_a}, PO-B={deletable_b}")

    # T09: Duplicate generation blocked (409)
    r = requests.post(
        f"{BASE}/sales-orders/{state['so_id']}/generate-pos",
        headers=h(admin),
        json={"shipment_type": "drop_ship"},
    )
    ok = r.status_code == 409
    record("Duplicate PO generation blocked (409)", ok, f"Status {r.status_code}")

    # T10: Generate POs for non-existing SO (404)
    r = requests.post(
        f"{BASE}/sales-orders/999999/generate-pos",
        headers=h(admin),
        json={"shipment_type": "drop_ship"},
    )
    ok = r.status_code == 404
    record("Generate POs for non-existing SO (404)", ok, f"Status {r.status_code}")


# ═══════════════════════════════════════════════════════════
#  PHASE 2: ADMIN -- PO LIST & DETAIL
# ═══════════════════════════════════════════════════════════

def test_phase2_admin_po_list_detail():
    log("\n" + SEPARATOR)
    log("PHASE 2: ADMIN -- PO List & Detail")
    log(SEPARATOR)

    admin = tokens["admin"]

    # T11: List all POs
    r = requests.get(f"{BASE}/purchase-orders", headers=h(admin))
    ok = r.status_code == 200
    po_list = r.json()["data"] if ok else []
    record("Admin: List all POs (200)", ok, f"{len(po_list)} POs returned")

    # T12: List response includes line_count and total_quantity
    if po_list:
        sample = po_list[0]
        ok = "line_count" in sample and "total_quantity" in sample
        record("List response has line_count & total_quantity", ok,
               f"line_count={sample.get('line_count')}, total_quantity={sample.get('total_quantity')}")
    else:
        record("List response has line_count & total_quantity", False, "No POs to check")

    # T13: Filter by sales_order_id
    r = requests.get(f"{BASE}/purchase-orders?sales_order_id={state['so_id']}", headers=h(admin))
    filtered = r.json()["data"] if r.status_code == 200 else []
    ok = len(filtered) == 2 and all(po["sales_order_id"] == state["so_id"] for po in filtered)
    record("Filter by sales_order_id", ok, f"{len(filtered)} POs for SO {state['so_id']}")

    # T14: Filter by vendor_id
    r = requests.get(f"{BASE}/purchase-orders?vendor_id={state['vendor_a_id']}", headers=h(admin))
    filtered = r.json()["data"] if r.status_code == 200 else []
    ok = all(po["vendor_id"] == state["vendor_a_id"] for po in filtered) and len(filtered) >= 1
    record("Filter by vendor_id", ok, f"{len(filtered)} POs for vendor_a")

    # T15: Filter by status
    r = requests.get(f"{BASE}/purchase-orders?status=in_production", headers=h(admin))
    filtered = r.json()["data"] if r.status_code == 200 else []
    ok = all(po["status"] == "in_production" for po in filtered)
    record("Filter by status=in_production", ok, f"{len(filtered)} POs")

    # T16: Filter by shipment_type
    r = requests.get(f"{BASE}/purchase-orders?shipment_type=drop_ship", headers=h(admin))
    filtered = r.json()["data"] if r.status_code == 200 else []
    ok = all(po["shipment_type"] == "drop_ship" for po in filtered)
    record("Filter by shipment_type=drop_ship", ok, f"{len(filtered)} POs")

    # T17: Search by PO number
    r = requests.get(f"{BASE}/purchase-orders?search=POTEST", headers=h(admin))
    filtered = r.json()["data"] if r.status_code == 200 else []
    ok = len(filtered) >= 2
    record("Search by PO number substring", ok, f"{len(filtered)} POs found")

    # T18: Get PO-A detail
    r = requests.get(f"{BASE}/purchase-orders/{state['po_a_id']}", headers=h(admin))
    ok = r.status_code == 200
    if ok:
        d = r.json()["data"]
        ok = (
            d["id"] == state["po_a_id"]
            and d["po_number"] == state["po_a_number"]
            and len(d["lines"]) == 2
            and d["vendor_name"] is not None
            and d["so_order_number"] is not None
            and d["client_name"] is not None
        )
        detail = f"po_number={d['po_number']}, lines={len(d['lines'])}, vendor={d['vendor_name']}"
    else:
        detail = f"Status {r.status_code}"
    record("Admin: Get PO-A detail (full fields)", ok, detail)

    # T19: PO lines have sku_code and sku_name
    if r.status_code == 200:
        lines = r.json()["data"]["lines"]
        ok = all(ln.get("sku_code") and ln.get("sku_name") for ln in lines)
        record("PO lines have sku_code & sku_name", ok,
               f"codes: {[ln.get('sku_code') for ln in lines]}")
    else:
        record("PO lines have sku_code & sku_name", False, "PO detail failed")

    # T20: Get non-existing PO (404)
    r = requests.get(f"{BASE}/purchase-orders/999999", headers=h(admin))
    ok = r.status_code == 404
    record("Get non-existing PO (404)", ok, f"Status {r.status_code}")


# ═══════════════════════════════════════════════════════════
#  PHASE 3: ADMIN -- STATUS TRANSITIONS (DROP-SHIP FLOW)
# ═══════════════════════════════════════════════════════════

def test_phase3_admin_dropship_status_flow():
    log("\n" + SEPARATOR)
    log("PHASE 3: ADMIN -- Drop-Ship Status Flow")
    log(SEPARATOR)

    admin = tokens["admin"]
    po_b_id = state["po_b_id"]

    # T21: IN_PRODUCTION -> PACKED_AND_SHIPPED
    r = requests.patch(
        f"{BASE}/purchase-orders/{po_b_id}", headers=h(admin),
        json={"status": "packed_and_shipped", "expected_ship_date": "2026-03-25"},
    )
    ok = r.status_code == 200
    new_status = r.json()["data"]["status"] if ok else "?"
    ok = ok and new_status == "packed_and_shipped"
    record("Drop-Ship: IN_PRODUCTION -> PACKED_AND_SHIPPED", ok, f"Status: {new_status}")

    # T22: Verify is_deletable is now False
    if r.status_code == 200:
        deletable = r.json()["data"]["is_deletable"]
        ok = deletable is False
        record("is_deletable=False after status change", ok, f"is_deletable={deletable}")
    else:
        record("is_deletable=False after status change", False, "Update failed")

    # T23: PACKED_AND_SHIPPED -> DELIVERED
    r = requests.patch(
        f"{BASE}/purchase-orders/{po_b_id}", headers=h(admin),
        json={"status": "delivered", "expected_arrival_date": "2026-04-01"},
    )
    ok = r.status_code == 200
    new_status = r.json()["data"]["status"] if ok else "?"
    ok = ok and new_status == "delivered"
    record("Drop-Ship: PACKED_AND_SHIPPED -> DELIVERED", ok, f"Status: {new_status}")

    # T24: DELIVERED is terminal -- try to go back to PACKED_AND_SHIPPED (400)
    r = requests.patch(
        f"{BASE}/purchase-orders/{po_b_id}", headers=h(admin),
        json={"status": "packed_and_shipped"},
    )
    ok = r.status_code == 400
    record("Drop-Ship: DELIVERED -> anything = 400", ok, f"Status {r.status_code}")

    # T25: Drop-Ship: IN_PRODUCTION -> READY_FOR_PICKUP = INVALID (400)
    po_a_id = state["po_a_id"]
    r = requests.patch(
        f"{BASE}/purchase-orders/{po_a_id}", headers=h(admin),
        json={"status": "ready_for_pickup"},
    )
    ok = r.status_code == 400
    record("Drop-Ship: IN_PRODUCTION -> READY_FOR_PICKUP = 400", ok, f"Status {r.status_code}")

    # T26: Drop-Ship: IN_PRODUCTION -> DELIVERED (skipping step) = INVALID (400)
    r = requests.patch(
        f"{BASE}/purchase-orders/{po_a_id}", headers=h(admin),
        json={"status": "delivered"},
    )
    ok = r.status_code == 400
    record("Drop-Ship: skip step IN_PRODUCTION -> DELIVERED = 400", ok, f"Status {r.status_code}")


# ═══════════════════════════════════════════════════════════
#  PHASE 4: ADMIN -- IN-HOUSE STATUS FLOW
# ═══════════════════════════════════════════════════════════

def test_phase4_admin_inhouse_status_flow():
    log("\n" + SEPARATOR)
    log("PHASE 4: ADMIN -- In-House Status Flow (change shipment type)")
    log(SEPARATOR)

    admin = tokens["admin"]
    po_a_id = state["po_a_id"]

    # T27: Change shipment_type from drop_ship to in_house (while IN_PRODUCTION)
    r = requests.patch(
        f"{BASE}/purchase-orders/{po_a_id}", headers=h(admin),
        json={"shipment_type": "in_house"},
    )
    ok = r.status_code == 200
    new_type = r.json()["data"]["shipment_type"] if ok else "?"
    ok = ok and new_type == "in_house"
    record("Change shipment_type -> in_house (while IN_PRODUCTION)", ok, f"type={new_type}")

    # T28: In-House: IN_PRODUCTION -> PACKED_AND_SHIPPED
    r = requests.patch(
        f"{BASE}/purchase-orders/{po_a_id}", headers=h(admin),
        json={"status": "packed_and_shipped"},
    )
    ok = r.status_code == 200
    new_status = r.json()["data"]["status"] if ok else "?"
    ok = ok and new_status == "packed_and_shipped"
    record("In-House: IN_PRODUCTION -> PACKED_AND_SHIPPED", ok, f"Status: {new_status}")

    # T29: Cannot change shipment_type once past IN_PRODUCTION (400)
    r = requests.patch(
        f"{BASE}/purchase-orders/{po_a_id}", headers=h(admin),
        json={"shipment_type": "drop_ship"},
    )
    ok = r.status_code == 400
    record("Cannot change shipment_type after IN_PRODUCTION (400)", ok, f"Status {r.status_code}")

    # T30: In-House: PACKED_AND_SHIPPED -> READY_FOR_PICKUP
    r = requests.patch(
        f"{BASE}/purchase-orders/{po_a_id}", headers=h(admin),
        json={"status": "ready_for_pickup"},
    )
    ok = r.status_code == 200
    new_status = r.json()["data"]["status"] if ok else "?"
    ok = ok and new_status == "ready_for_pickup"
    record("In-House: PACKED_AND_SHIPPED -> READY_FOR_PICKUP", ok, f"Status: {new_status}")

    # T31: In-House: READY_FOR_PICKUP -> DELIVERED
    r = requests.patch(
        f"{BASE}/purchase-orders/{po_a_id}", headers=h(admin),
        json={"status": "delivered"},
    )
    ok = r.status_code == 200
    new_status = r.json()["data"]["status"] if ok else "?"
    ok = ok and new_status == "delivered"
    record("In-House: READY_FOR_PICKUP -> DELIVERED", ok, f"Status: {new_status}")

    # T32: In-House DELIVERED is terminal
    r = requests.patch(
        f"{BASE}/purchase-orders/{po_a_id}", headers=h(admin),
        json={"status": "packed_and_shipped"},
    )
    ok = r.status_code == 400
    record("In-House: DELIVERED is terminal (400)", ok, f"Status {r.status_code}")


# ═══════════════════════════════════════════════════════════
#  PHASE 5: ADMIN -- PO LINE UPDATE
# ═══════════════════════════════════════════════════════════

def test_phase5_admin_po_line_update():
    log("\n" + SEPARATOR)
    log("PHASE 5: ADMIN -- PO Line Updates")
    log(SEPARATOR)

    admin = tokens["admin"]

    # Use the non-assigned PO for line tests (still IN_PRODUCTION)
    # First get its detail to find a line id
    r = requests.get(f"{BASE}/purchase-orders/{state['non_assigned_po_id']}", headers=h(admin))
    assert r.status_code == 200, f"Failed to get non-assigned PO: {r.text}"
    na_po = r.json()["data"]
    na_line_id = na_po["lines"][0]["id"]
    na_po_id = na_po["id"]

    # T33: Update PO line dates
    r = requests.patch(
        f"{BASE}/purchase-orders/{na_po_id}/lines/{na_line_id}",
        headers=h(admin),
        json={
            "due_date": "2026-05-01",
            "expected_ship_date": "2026-04-20",
            "expected_arrival_date": "2026-04-28",
        },
    )
    ok = r.status_code == 200
    if ok:
        ld = r.json()["data"]
        ok = (
            ld["due_date"] == "2026-05-01"
            and ld["expected_ship_date"] == "2026-04-20"
            and ld["expected_arrival_date"] == "2026-04-28"
        )
        detail = f"due_date={ld['due_date']}, ship={ld['expected_ship_date']}, arrival={ld['expected_arrival_date']}"
    else:
        detail = f"Status {r.status_code}: {safe_json(r)}"
    record("Admin: Update PO line dates", ok, detail)

    # T34: Update PO line with only one field (partial update)
    r = requests.patch(
        f"{BASE}/purchase-orders/{na_po_id}/lines/{na_line_id}",
        headers=h(admin),
        json={"expected_ship_date": "2026-04-22"},
    )
    ok = r.status_code == 200
    if ok:
        ld = r.json()["data"]
        # due_date should remain from previous update
        ok = ld["expected_ship_date"] == "2026-04-22" and ld["due_date"] == "2026-05-01"
        detail = f"ship={ld['expected_ship_date']}, due_date still={ld['due_date']}"
    else:
        detail = f"Status {r.status_code}"
    record("Admin: Partial PO line update (1 field)", ok, detail)

    # T35: Update non-existing line (404)
    r = requests.patch(
        f"{BASE}/purchase-orders/{na_po_id}/lines/999999",
        headers=h(admin),
        json={"due_date": "2026-06-01"},
    )
    ok = r.status_code == 404
    record("Update non-existing PO line (404)", ok, f"Status {r.status_code}")

    # T36: Line on wrong PO (404)
    r = requests.patch(
        f"{BASE}/purchase-orders/{state['po_a_id']}/lines/{na_line_id}",
        headers=h(admin),
        json={"due_date": "2026-06-01"},
    )
    ok = r.status_code == 404
    record("Update line on wrong PO (404)", ok, f"Status {r.status_code}")


# ═══════════════════════════════════════════════════════════
#  PHASE 6: ADMIN -- PO DELETE
# ═══════════════════════════════════════════════════════════

def test_phase6_admin_po_delete():
    log("\n" + SEPARATOR)
    log("PHASE 6: ADMIN -- PO Delete")
    log(SEPARATOR)

    admin = tokens["admin"]

    # T37: Cannot delete DELIVERED PO (400)
    r = requests.delete(
        f"{BASE}/purchase-orders/{state['po_a_id']}", headers=h(admin),
    )
    ok = r.status_code == 400
    record("Cannot delete DELIVERED PO (400)", ok, f"Status {r.status_code}")

    # T38: Cannot delete DELIVERED PO-B (400)
    r = requests.delete(
        f"{BASE}/purchase-orders/{state['po_b_id']}", headers=h(admin),
    )
    ok = r.status_code == 400
    record("Cannot delete DELIVERED PO-B (400)", ok, f"Status {r.status_code}")

    # T39: Delete non-existing PO (404)
    r = requests.delete(f"{BASE}/purchase-orders/999999", headers=h(admin))
    ok = r.status_code == 404
    record("Delete non-existing PO (404)", ok, f"Status {r.status_code}")

    # We need an IN_PRODUCTION PO to test successful delete
    # Use non_assigned_po which is still IN_PRODUCTION
    # T40: Delete IN_PRODUCTION PO (200)
    r = requests.delete(
        f"{BASE}/purchase-orders/{state['non_assigned_po_id']}", headers=h(admin),
    )
    ok = r.status_code == 200
    record("Delete IN_PRODUCTION PO (200)", ok, f"Status {r.status_code}")

    # T41: Verify deleted PO is gone (404)
    r = requests.get(
        f"{BASE}/purchase-orders/{state['non_assigned_po_id']}", headers=h(admin),
    )
    ok = r.status_code == 404
    record("Verify deleted PO not found (404)", ok, f"Status {r.status_code}")

    # Re-generate POs for non-assigned SO (needed for AM/Vendor tests)
    r = requests.post(
        f"{BASE}/sales-orders/{state['so2_id']}/generate-pos",
        headers=h(admin), json={"shipment_type": "drop_ship"},
    )
    if r.status_code == 201:
        new_pos = r.json()["data"]["purchase_orders"]
        state["non_assigned_po_id"] = new_pos[0]["id"]
        state["non_assigned_po_line_id"] = new_pos[0]["lines"][0]["id"] if new_pos[0]["lines"] else None
        log(f"  (Re-generated non-assigned PO id={state['non_assigned_po_id']})")


# ═══════════════════════════════════════════════════════════
#  PHASE 7: ADMIN -- PO DATE UPDATES
# ═══════════════════════════════════════════════════════════

def test_phase7_admin_po_date_updates():
    log("\n" + SEPARATOR)
    log("PHASE 7: ADMIN -- PO Header Date Updates")
    log(SEPARATOR)

    admin = tokens["admin"]

    # Re-generate a fresh PO set for date testing
    ts = datetime.datetime.now().strftime("%H%M%S%f")[:8]
    so_num = f"SO-DATES-{ts}"
    r = requests.post(f"{BASE}/sales-orders", headers=h(admin), json={
        "order_number": so_num,
        "client_id": state["am_client_id"],
        "lines": [{"sku_id": state["sku_a1_id"], "ordered_qty": 10, "unit_price": "5.00"}],
    })
    assert r.status_code == 201, f"SO for dates failed: {r.text}"
    date_so_id = r.json()["data"]["id"]
    state["date_so_id"] = date_so_id

    r = requests.post(f"{BASE}/sales-orders/{date_so_id}/generate-pos",
                      headers=h(admin), json={"shipment_type": "drop_ship"})
    assert r.status_code == 201, f"PO gen for dates failed: {r.text}"
    date_po = r.json()["data"]["purchase_orders"][0]
    date_po_id = date_po["id"]
    state["date_po_id"] = date_po_id

    # T42: Update expected_ship_date
    r = requests.patch(f"{BASE}/purchase-orders/{date_po_id}", headers=h(admin),
                       json={"expected_ship_date": "2026-04-15"})
    ok = r.status_code == 200 and r.json()["data"]["expected_ship_date"] == "2026-04-15"
    record("Update expected_ship_date on PO header", ok,
           f"expected_ship_date={r.json()['data'].get('expected_ship_date') if ok else '?'}")

    # T43: Update expected_arrival_date
    r = requests.patch(f"{BASE}/purchase-orders/{date_po_id}", headers=h(admin),
                       json={"expected_arrival_date": "2026-04-25"})
    ok = r.status_code == 200 and r.json()["data"]["expected_arrival_date"] == "2026-04-25"
    record("Update expected_arrival_date on PO header", ok,
           f"expected_arrival_date={r.json()['data'].get('expected_arrival_date') if ok else '?'}")

    # T44: Update both dates + status together
    r = requests.patch(f"{BASE}/purchase-orders/{date_po_id}", headers=h(admin),
                       json={
                           "status": "packed_and_shipped",
                           "expected_ship_date": "2026-04-16",
                           "expected_arrival_date": "2026-04-26",
                       })
    ok = r.status_code == 200
    if ok:
        d = r.json()["data"]
        ok = d["status"] == "packed_and_shipped" and d["expected_ship_date"] == "2026-04-16"
    record("Update status + dates together", ok, f"Status {r.status_code}")


# ═══════════════════════════════════════════════════════════
#  PHASE 8: AM -- SCOPED ACCESS (ASSIGNED CLIENT ONLY)
# ═══════════════════════════════════════════════════════════

def test_phase8_am_scoped_access():
    log("\n" + SEPARATOR)
    log("PHASE 8: ACCOUNT MANAGER -- Scoped PO Access")
    log(SEPARATOR)

    am = tokens["am"]

    # T45: AM can list POs (sees only POs for assigned clients)
    r = requests.get(f"{BASE}/purchase-orders", headers=h(am))
    ok = r.status_code == 200
    am_pos = r.json()["data"] if ok else []
    # AM should see POs for SO linked to TestClient LLC, but NOT the non-assigned ones
    assigned_only = all(
        po.get("client_name") == "TestClient LLC" or po.get("so_order_number", "").startswith("SO-DATES")
        for po in am_pos
    )
    record("AM: List POs (200, scoped)", ok and assigned_only,
           f"{len(am_pos)} POs, all assigned: {assigned_only}")

    # T46: AM should NOT see non-assigned client's POs in the list
    non_assigned_po_ids = [state.get("non_assigned_po_id")]
    am_po_ids = [po["id"] for po in am_pos]
    ok = all(na_id not in am_po_ids for na_id in non_assigned_po_ids if na_id)
    record("AM: Non-assigned POs NOT in list", ok,
           f"non_assigned_po_id={state.get('non_assigned_po_id')} in AM list: {not ok}")

    # T47: AM can view PO detail for assigned client's PO
    r = requests.get(f"{BASE}/purchase-orders/{state['po_a_id']}", headers=h(am))
    ok = r.status_code == 200
    record("AM: View assigned client's PO detail (200)", ok, f"Status {r.status_code}")

    # T48: AM CANNOT view non-assigned client's PO (403)
    r = requests.get(f"{BASE}/purchase-orders/{state['non_assigned_po_id']}", headers=h(am))
    ok = r.status_code == 403
    record("AM: View non-assigned PO (403)", ok, f"Status {r.status_code}")

    # T49: AM can update assigned client's PO dates
    # Use date_po_id which is for am_client
    r = requests.patch(
        f"{BASE}/purchase-orders/{state['date_po_id']}", headers=h(am),
        json={"expected_arrival_date": "2026-05-10"},
    )
    ok = r.status_code == 200
    record("AM: Update assigned PO dates (200)", ok, f"Status {r.status_code}")

    # T50: AM CANNOT update non-assigned PO (403)
    r = requests.patch(
        f"{BASE}/purchase-orders/{state['non_assigned_po_id']}", headers=h(am),
        json={"expected_ship_date": "2026-05-05"},
    )
    ok = r.status_code == 403
    record("AM: Update non-assigned PO (403)", ok, f"Status {r.status_code}")

    # T51: AM CANNOT delete PO (403 -- Admin only)
    r = requests.delete(f"{BASE}/purchase-orders/{state['po_a_id']}", headers=h(am))
    ok = r.status_code == 403
    record("AM: Delete PO (403 -- Admin only)", ok, f"Status {r.status_code}")

    # T52: AM can update PO line on assigned client's PO
    # Get a line from date_po
    r = requests.get(f"{BASE}/purchase-orders/{state['date_po_id']}", headers=h(am))
    if r.status_code == 200 and r.json()["data"]["lines"]:
        line_id = r.json()["data"]["lines"][0]["id"]
        r = requests.patch(
            f"{BASE}/purchase-orders/{state['date_po_id']}/lines/{line_id}",
            headers=h(am),
            json={"expected_ship_date": "2026-05-15"},
        )
        ok = r.status_code == 200
        record("AM: Update PO line on assigned PO (200)", ok, f"Status {r.status_code}")
    else:
        record("AM: Update PO line on assigned PO (200)", False, "Could not find line")

    # T53: AM CANNOT update PO line on non-assigned PO (403)
    na_line_id = state.get("non_assigned_po_line_id")
    if na_line_id:
        r = requests.patch(
            f"{BASE}/purchase-orders/{state['non_assigned_po_id']}/lines/{na_line_id}",
            headers=h(am),
            json={"expected_ship_date": "2026-05-15"},
        )
        ok = r.status_code == 403
        record("AM: Update PO line on non-assigned PO (403)", ok, f"Status {r.status_code}")
    else:
        record("AM: Update PO line on non-assigned PO (403)", False, "No line_id available")

    # T54: AM can generate POs for assigned client's SO
    ts = datetime.datetime.now().strftime("%H%M%S%f")[:8]
    so_num = f"SO-AMGEN-{ts}"
    admin = tokens["admin"]
    r = requests.post(f"{BASE}/sales-orders", headers=h(admin), json={
        "order_number": so_num,
        "client_id": state["am_client_id"],
        "lines": [{"sku_id": state["sku_a1_id"], "ordered_qty": 5, "unit_price": "5.00"}],
    })
    assert r.status_code == 201
    am_gen_so_id = r.json()["data"]["id"]
    state["am_gen_so_id"] = am_gen_so_id

    r = requests.post(
        f"{BASE}/sales-orders/{am_gen_so_id}/generate-pos",
        headers=h(tokens["am"]),
        json={"shipment_type": "in_house"},
    )
    ok = r.status_code == 201
    if ok:
        am_gen_pos = r.json()["data"]["purchase_orders"]
        state["am_gen_po_id"] = am_gen_pos[0]["id"]
        detail = f"PO id={am_gen_pos[0]['id']}, shipment_type={am_gen_pos[0]['shipment_type']}"
    else:
        detail = f"Status {r.status_code}: {safe_json(r)}"
    record("AM: Generate POs for assigned client's SO (201)", ok, detail)

    # T55: AM CANNOT generate POs for non-assigned client's SO (403)
    # First delete the existing POs on non-assigned SO so we can try to re-generate
    requests.delete(f"{BASE}/purchase-orders/{state['non_assigned_po_id']}", headers=h(admin))
    r = requests.post(
        f"{BASE}/sales-orders/{state['so2_id']}/generate-pos",
        headers=h(tokens["am"]),
        json={"shipment_type": "drop_ship"},
    )
    ok = r.status_code == 403
    record("AM: Generate POs for non-assigned SO (403)", ok, f"Status {r.status_code}")

    # Re-generate non-assigned POs for vendor tests
    r = requests.post(
        f"{BASE}/sales-orders/{state['so2_id']}/generate-pos",
        headers=h(admin), json={"shipment_type": "drop_ship"},
    )
    if r.status_code == 201:
        new_pos = r.json()["data"]["purchase_orders"]
        state["non_assigned_po_id"] = new_pos[0]["id"]
        state["non_assigned_po_line_id"] = new_pos[0]["lines"][0]["id"] if new_pos[0]["lines"] else None

    # T56: AM can filter POs by sales_order_id for assigned SO
    r = requests.get(f"{BASE}/purchase-orders?sales_order_id={state['so_id']}", headers=h(tokens["am"]))
    ok = r.status_code == 200
    am_filtered = r.json()["data"] if ok else []
    ok = ok and len(am_filtered) >= 2
    record("AM: Filter POs by assigned SO's sales_order_id", ok, f"{len(am_filtered)} POs")


# ═══════════════════════════════════════════════════════════
#  PHASE 9: VENDOR -- OWN POs ONLY
# ═══════════════════════════════════════════════════════════

def test_phase9_vendor_access():
    log("\n" + SEPARATOR)
    log("PHASE 9: VENDOR -- Own POs Only")
    log(SEPARATOR)

    vendor = tokens["vendor"]
    admin = tokens["admin"]

    # First, check what vendor_id the vendor user is linked to
    r = requests.get(f"{BASE}/auth/me", headers=h(vendor))
    vendor_info = r.json()["data"]
    linked_vendor_id = vendor_info.get("vendor_id")
    log(f"  Vendor user linked to vendor_id={linked_vendor_id}")

    # We need POs linked to the TestVendor Corp (the vendor user's vendor)
    # Create a SKU linked to TestVendor Corp, create an SO, generate POs
    ts = datetime.datetime.now().strftime("%H%M%S%f")[:8]

    # Create SKU with default_vendor_id = TestVendor Corp
    sku_tv_code = f"PO-SKU-TV-{ts}"
    r = requests.post(f"{BASE}/skus", headers=h(admin), json={
        "sku_code": sku_tv_code, "name": "TestVendor SKU",
        "default_vendor_id": linked_vendor_id,
        "tier_prices": [{"min_qty": 1, "unit_price": "10.00"}],
    })
    assert r.status_code == 201, f"SKU creation for vendor test failed: {r.text}"
    sku_tv_id = r.json()["data"]["id"]

    # Link vendor
    requests.post(f"{BASE}/skus/{sku_tv_id}/vendors", headers=h(admin), json={
        "vendor_id": linked_vendor_id, "is_default": True
    })

    # Create SO
    so_tv_num = f"SO-VNDR-{ts}"
    r = requests.post(f"{BASE}/sales-orders", headers=h(admin), json={
        "order_number": so_tv_num,
        "client_id": state["am_client_id"],
        "lines": [{"sku_id": sku_tv_id, "ordered_qty": 25, "unit_price": "10.00"}],
    })
    assert r.status_code == 201, f"SO for vendor test failed: {r.text}"
    so_tv_id = r.json()["data"]["id"]
    state["vendor_so_id"] = so_tv_id

    # Generate PO
    r = requests.post(f"{BASE}/sales-orders/{so_tv_id}/generate-pos",
                      headers=h(admin), json={"shipment_type": "drop_ship"})
    assert r.status_code == 201, f"PO gen for vendor test failed: {r.text}"
    vendor_po = r.json()["data"]["purchase_orders"][0]
    vendor_po_id = vendor_po["id"]
    vendor_po_line_id = vendor_po["lines"][0]["id"]
    state["vendor_po_id"] = vendor_po_id
    state["vendor_po_line_id"] = vendor_po_line_id
    log(f"  Created PO id={vendor_po_id} for TestVendor Corp")

    # T57: Vendor can list POs (sees only own POs)
    r = requests.get(f"{BASE}/purchase-orders", headers=h(vendor))
    ok = r.status_code == 200
    vendor_pos = r.json()["data"] if ok else []
    all_own = all(po["vendor_id"] == linked_vendor_id for po in vendor_pos)
    ok = ok and all_own
    record("Vendor: List POs (only own vendor's POs)", ok,
           f"{len(vendor_pos)} POs, all own: {all_own}")

    # T58: Vendor CANNOT see other vendor's POs
    other_po_ids = [state.get("non_assigned_po_id")]
    vendor_po_ids = [po["id"] for po in vendor_pos]
    ok = all(oid not in vendor_po_ids for oid in other_po_ids if oid)
    record("Vendor: Other vendor's POs NOT in list", ok, "")

    # T59: Vendor can view own PO detail
    r = requests.get(f"{BASE}/purchase-orders/{vendor_po_id}", headers=h(vendor))
    ok = r.status_code == 200
    record("Vendor: View own PO detail (200)", ok, f"Status {r.status_code}")

    # T60: Vendor CANNOT view other vendor's PO (403)
    r = requests.get(f"{BASE}/purchase-orders/{state['po_a_id']}", headers=h(vendor))
    ok = r.status_code == 403
    record("Vendor: View other vendor's PO (403)", ok, f"Status {r.status_code}")

    # T61: Vendor can update own PO status (IN_PRODUCTION -> PACKED_AND_SHIPPED)
    r = requests.patch(
        f"{BASE}/purchase-orders/{vendor_po_id}", headers=h(vendor),
        json={"status": "packed_and_shipped", "expected_ship_date": "2026-04-10"},
    )
    ok = r.status_code == 200
    new_status = r.json()["data"]["status"] if ok else "?"
    ok = ok and new_status == "packed_and_shipped"
    record("Vendor: Update own PO status (200)", ok, f"Status: {new_status}")

    # T62: Vendor can update own PO dates
    r = requests.patch(
        f"{BASE}/purchase-orders/{vendor_po_id}", headers=h(vendor),
        json={"expected_arrival_date": "2026-04-18"},
    )
    ok = r.status_code == 200
    record("Vendor: Update own PO dates (200)", ok, f"Status {r.status_code}")

    # T63: Vendor CANNOT update other vendor's PO (403)
    r = requests.patch(
        f"{BASE}/purchase-orders/{state['non_assigned_po_id']}", headers=h(vendor),
        json={"expected_ship_date": "2026-05-01"},
    )
    ok = r.status_code == 403
    record("Vendor: Update other vendor's PO (403)", ok, f"Status {r.status_code}")

    # T64: Vendor can update own PO line dates
    r = requests.patch(
        f"{BASE}/purchase-orders/{vendor_po_id}/lines/{vendor_po_line_id}",
        headers=h(vendor),
        json={"expected_ship_date": "2026-04-12", "expected_arrival_date": "2026-04-19"},
    )
    ok = r.status_code == 200
    record("Vendor: Update own PO line dates (200)", ok, f"Status {r.status_code}")

    # T65: Vendor CANNOT update other vendor's PO line (403)
    # Use non_assigned_po_line_id
    na_line = state.get("non_assigned_po_line_id")
    if na_line:
        r = requests.patch(
            f"{BASE}/purchase-orders/{state['non_assigned_po_id']}/lines/{na_line}",
            headers=h(vendor),
            json={"expected_ship_date": "2026-05-01"},
        )
        ok = r.status_code == 403
        record("Vendor: Update other vendor's PO line (403)", ok, f"Status {r.status_code}")
    else:
        record("Vendor: Update other vendor's PO line (403)", False, "No line available")

    # T66: Vendor CANNOT delete PO (403 -- Admin only)
    r = requests.delete(f"{BASE}/purchase-orders/{vendor_po_id}", headers=h(vendor))
    ok = r.status_code == 403
    record("Vendor: Delete PO (403 -- Admin only)", ok, f"Status {r.status_code}")

    # T67: Vendor CANNOT generate POs (403 -- Admin/AM only)
    r = requests.post(
        f"{BASE}/sales-orders/{state['so_id']}/generate-pos",
        headers=h(vendor),
        json={"shipment_type": "drop_ship"},
    )
    ok = r.status_code == 403
    record("Vendor: Generate POs (403 -- Admin/AM only)", ok, f"Status {r.status_code}")

    # T68: Vendor can filter own POs by status
    r = requests.get(f"{BASE}/purchase-orders?status=packed_and_shipped", headers=h(vendor))
    ok = r.status_code == 200
    filtered = r.json()["data"] if ok else []
    all_own = all(po["vendor_id"] == linked_vendor_id for po in filtered)
    ok = ok and all_own
    record("Vendor: Filter own POs by status", ok, f"{len(filtered)} POs")

    # T69: Vendor delivers own PO (complete flow)
    r = requests.patch(
        f"{BASE}/purchase-orders/{vendor_po_id}", headers=h(vendor),
        json={"status": "delivered"},
    )
    ok = r.status_code == 200
    new_status = r.json()["data"]["status"] if ok else "?"
    ok = ok and new_status == "delivered"
    record("Vendor: Complete drop-ship delivery flow", ok, f"Status: {new_status}")


# ═══════════════════════════════════════════════════════════
#  PHASE 10: UNAUTHENTICATED ACCESS
# ═══════════════════════════════════════════════════════════

def test_phase10_unauthenticated():
    log("\n" + SEPARATOR)
    log("PHASE 10: UNAUTHENTICATED -- No Token")
    log(SEPARATOR)

    # T70: No token -> list POs (401)
    r = requests.get(f"{BASE}/purchase-orders")
    ok = r.status_code == 401
    record("No token: List POs (401)", ok, f"Status {r.status_code}")

    # T71: No token -> PO detail (401)
    r = requests.get(f"{BASE}/purchase-orders/{state['po_a_id']}")
    ok = r.status_code == 401
    record("No token: PO detail (401)", ok, f"Status {r.status_code}")

    # T72: No token -> update PO (401)
    r = requests.patch(f"{BASE}/purchase-orders/{state['po_a_id']}",
                       json={"status": "packed_and_shipped"})
    ok = r.status_code == 401
    record("No token: Update PO (401)", ok, f"Status {r.status_code}")

    # T73: No token -> delete PO (401)
    r = requests.delete(f"{BASE}/purchase-orders/{state['po_a_id']}")
    ok = r.status_code == 401
    record("No token: Delete PO (401)", ok, f"Status {r.status_code}")

    # T74: No token -> generate POs (401)
    r = requests.post(f"{BASE}/sales-orders/{state['so_id']}/generate-pos",
                      json={"shipment_type": "drop_ship"})
    ok = r.status_code == 401
    record("No token: Generate POs (401)", ok, f"Status {r.status_code}")

    # T75: Invalid token -> list POs (401)
    r = requests.get(f"{BASE}/purchase-orders",
                     headers={"Authorization": "Bearer invalid_token_xyz"})
    ok = r.status_code == 401
    record("Invalid token: List POs (401)", ok, f"Status {r.status_code}")


# ═══════════════════════════════════════════════════════════
#  PHASE 11: EDGE CASES
# ═══════════════════════════════════════════════════════════

def test_phase11_edge_cases():
    log("\n" + SEPARATOR)
    log("PHASE 11: EDGE CASES")
    log(SEPARATOR)

    admin = tokens["admin"]

    # T76: Generate POs for SO with no lines (should fail)
    ts = datetime.datetime.now().strftime("%H%M%S%f")[:8]
    so_empty_num = f"SO-EMPTY-{ts}"
    r = requests.post(f"{BASE}/sales-orders", headers=h(admin), json={
        "order_number": so_empty_num,
        "client_id": state["am_client_id"],
        "lines": [],
    })
    assert r.status_code == 201, f"Empty SO creation failed: {r.text}"
    empty_so_id = r.json()["data"]["id"]
    state["empty_so_id"] = empty_so_id

    r = requests.post(
        f"{BASE}/sales-orders/{empty_so_id}/generate-pos",
        headers=h(admin), json={"shipment_type": "drop_ship"},
    )
    ok = r.status_code == 400
    record("Generate POs from SO with no lines (400)", ok, f"Status {r.status_code}")

    # T77: Generate POs with in_house shipment type
    so_ih_num = f"SO-INHOUSE-{ts}"
    r = requests.post(f"{BASE}/sales-orders", headers=h(admin), json={
        "order_number": so_ih_num,
        "client_id": state["am_client_id"],
        "lines": [{"sku_id": state["sku_a1_id"], "ordered_qty": 30, "unit_price": "5.00"}],
    })
    assert r.status_code == 201
    ih_so_id = r.json()["data"]["id"]
    state["ih_so_id"] = ih_so_id

    r = requests.post(
        f"{BASE}/sales-orders/{ih_so_id}/generate-pos",
        headers=h(admin), json={"shipment_type": "in_house"},
    )
    ok = r.status_code == 201
    if ok:
        ih_po = r.json()["data"]["purchase_orders"][0]
        ok = ih_po["shipment_type"] == "in_house"
        state["ih_po_id"] = ih_po["id"]
        detail = f"PO type={ih_po['shipment_type']}"
    else:
        detail = f"Status {r.status_code}"
    record("Generate POs with in_house shipment type", ok, detail)

    # T78: In-House: PACKED_AND_SHIPPED -> DELIVERED = INVALID (should go through READY_FOR_PICKUP)
    # First advance to PACKED_AND_SHIPPED
    requests.patch(f"{BASE}/purchase-orders/{state['ih_po_id']}", headers=h(admin),
                   json={"status": "packed_and_shipped"})
    r = requests.patch(f"{BASE}/purchase-orders/{state['ih_po_id']}", headers=h(admin),
                       json={"status": "delivered"})
    ok = r.status_code == 400
    record("In-House: PACKED_AND_SHIPPED -> DELIVERED = 400 (must go via READY_FOR_PICKUP)", ok,
           f"Status {r.status_code}")

    # T79: Setting same status (no-op should still be 200)
    r = requests.patch(f"{BASE}/purchase-orders/{state['ih_po_id']}", headers=h(admin),
                       json={"status": "packed_and_shipped"})
    ok = r.status_code == 200
    record("Set same status (no-op, 200)", ok, f"Status {r.status_code}")

    # T80: Empty PATCH body (should be 200, no changes)
    r = requests.patch(f"{BASE}/purchase-orders/{state['ih_po_id']}", headers=h(admin),
                       json={})
    ok = r.status_code == 200
    record("Empty PATCH body (200, no changes)", ok, f"Status {r.status_code}")

    # T81: Combined filter: status + vendor_id
    r = requests.get(
        f"{BASE}/purchase-orders?status=in_production&vendor_id={state['vendor_a_id']}",
        headers=h(admin),
    )
    ok = r.status_code == 200
    filtered = r.json()["data"] if ok else []
    all_match = all(
        po["status"] == "in_production" and po["vendor_id"] == state["vendor_a_id"]
        for po in filtered
    )
    record("Combined filter: status + vendor_id", ok and all_match, f"{len(filtered)} POs")

    # T82: Search with no matches
    r = requests.get(f"{BASE}/purchase-orders?search=XYZNONEXISTENT999", headers=h(admin))
    ok = r.status_code == 200 and len(r.json()["data"]) == 0
    record("Search with no matches (empty list)", ok,
           f"{len(r.json()['data']) if r.status_code == 200 else '?'} POs")


# ═══════════════════════════════════════════════════════════
#  CLEANUP
# ═══════════════════════════════════════════════════════════

def cleanup():
    log("\n" + SEPARATOR)
    log("CLEANUP: Removing test data")
    log(SEPARATOR)

    admin = tokens["admin"]

    # Delete POs first (they depend on SOs)
    # Get all POs and delete the IN_PRODUCTION ones
    r = requests.get(f"{BASE}/purchase-orders?search=POTEST", headers=h(admin))
    if r.status_code == 200:
        for po in r.json()["data"]:
            if po["status"] == "in_production":
                requests.delete(f"{BASE}/purchase-orders/{po['id']}", headers=h(admin))
                log(f"  Deleted PO {po['po_number']} (in_production)")
            else:
                log(f"  Skipped PO {po['po_number']} ({po['status']})")

    # Delete SOs (cascade deletes PO lines)
    so_ids_to_clean = [
        state.get("so_id"), state.get("so2_id"), state.get("date_so_id"),
        state.get("am_gen_so_id"), state.get("empty_so_id"), state.get("ih_so_id"),
        state.get("vendor_so_id"),
    ]
    for so_id in so_ids_to_clean:
        if so_id:
            r = requests.delete(f"{BASE}/sales-orders/{so_id}", headers=h(admin))
            log(f"  SO id={so_id}: {r.status_code}")

    log("  Cleanup done.")


# ═══════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════

def main():
    log("\n" + SEPARATOR)
    log("  PURCHASE ORDER API - COMPREHENSIVE TEST SUITE")
    log("  Testing ALL endpoints with Admin, AM, and Vendor roles")
    log(SEPARATOR)

    # ── Login all roles ───────────────────────────────────
    log("\n--- Logging in all roles ---")
    try:
        tokens["admin"] = login("ADMIN", ADMIN_CREDS)
        tokens["am"] = login("AM", AM_CREDS)
        tokens["vendor"] = login("VENDOR", VENDOR_CREDS)
    except Exception as e:
        log(f"\n  FATAL: Login failed: {e}")
        log("  Make sure the server is running and seed users exist.")
        sys.exit(1)

    # ── Setup test data ───────────────────────────────────
    try:
        setup_test_data()
    except Exception as e:
        log(f"\n  FATAL: Setup failed: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)

    # ── Run all test phases ───────────────────────────────
    phases = [
        test_phase1_admin_po_generation,
        test_phase2_admin_po_list_detail,
        test_phase3_admin_dropship_status_flow,
        test_phase4_admin_inhouse_status_flow,
        test_phase5_admin_po_line_update,
        test_phase6_admin_po_delete,
        test_phase7_admin_po_date_updates,
        test_phase8_am_scoped_access,
        test_phase9_vendor_access,
        test_phase10_unauthenticated,
        test_phase11_edge_cases,
    ]

    for phase_fn in phases:
        try:
            phase_fn()
        except Exception as e:
            log(f"\n  ERROR in {phase_fn.__name__}: {e}")
            import traceback; traceback.print_exc()

    # ── Cleanup ───────────────────────────────────────────
    try:
        cleanup()
    except Exception as e:
        log(f"\n  Cleanup error: {e}")

    # ── Summary ───────────────────────────────────────────
    log("\n" + SEPARATOR)
    log("  FINAL TEST RESULTS")
    log(SEPARATOR)

    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    total = len(results)

    if failed > 0:
        log("\n  FAILED TESTS:")
        for name, ok, detail in results:
            if not ok:
                log(f"    {FAIL_MARK} {name}  -- {detail}")

    log(f"\n  TOTAL: {total}  |  PASSED: {passed}  |  FAILED: {failed}")
    pct = (passed / total * 100) if total > 0 else 0
    log(f"  PASS RATE: {pct:.1f}%")

    if failed == 0:
        log("\n  ALL TESTS PASSED!")
    else:
        log(f"\n  {failed} TEST(S) FAILED -- see details above")

    log(SEPARATOR + "\n")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())