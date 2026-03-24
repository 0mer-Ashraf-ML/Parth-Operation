"""
Seed script – creates test users for all three roles:
  1. Admin        (already exists from seed_admin.py)
  2. Account Manager  (am@gmail.com  / am123)
  3. Vendor user       (vendor@gmail.com / vendor123)

Also creates:
  - A Vendor record ("TestVendor Corp") for the Vendor user
  - A Client record ("TestClient LLC") for the AM assignment
  - A ClientAssignment linking the AM to the Client

Run from the project root:
    python -m scripts.seed_test_users
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.database import SessionLocal
from app.models.enums import UserRole
from app.models.user import ClientAssignment, User
from app.models.vendor import Vendor
from app.models.client import Client
from app.services.auth import hash_password


def main() -> None:
    db = SessionLocal()
    try:
        # ─────────────────────────────────────────────────────
        # 1. Ensure a Vendor record exists
        # ─────────────────────────────────────────────────────
        vendor_record = db.execute(
            select(Vendor).where(Vendor.company_name == "TestVendor Corp")
        ).scalar_one_or_none()

        if vendor_record is None:
            vendor_record = Vendor(
                company_name="TestVendor Corp",
                contact_name="Ali Khan",
                email="ali@testvendor.com",
                phone="+92-300-1234567",
            )
            db.add(vendor_record)
            db.commit()
            db.refresh(vendor_record)
            print(f"  [CREATED] Vendor: TestVendor Corp (id={vendor_record.id})")
        else:
            print(f"  [EXISTS]  Vendor: TestVendor Corp (id={vendor_record.id})")

        # ─────────────────────────────────────────────────────
        # 2. Ensure a Client record exists
        # ─────────────────────────────────────────────────────
        client_record = db.execute(
            select(Client).where(Client.company_name == "TestClient LLC")
        ).scalar_one_or_none()

        if client_record is None:
            client_record = Client(
                company_name="TestClient LLC",
                payment_terms=30,
                notes="Test client for AM assignment",
            )
            db.add(client_record)
            db.commit()
            db.refresh(client_record)
            print(f"  [CREATED] Client: TestClient LLC (id={client_record.id})")
        else:
            print(f"  [EXISTS]  Client: TestClient LLC (id={client_record.id})")

        # ─────────────────────────────────────────────────────
        # 3. Create Vendor user (vendor@gmail.com)
        # ─────────────────────────────────────────────────────
        vendor_user = db.execute(
            select(User).where(User.email == "vendor@gmail.com")
        ).scalar_one_or_none()

        if vendor_user is None:
            vendor_user = User(
                email="vendor@gmail.com",
                password_hash=hash_password("vendor123"),
                full_name="Test Vendor User",
                role=UserRole.VENDOR,
                vendor_id=vendor_record.id,
                is_active=True,
            )
            db.add(vendor_user)
            db.commit()
            db.refresh(vendor_user)
            print(f"  [CREATED] Vendor User: vendor@gmail.com (id={vendor_user.id}, vendor_id={vendor_record.id})")
        else:
            print(f"  [EXISTS]  Vendor User: vendor@gmail.com (id={vendor_user.id})")

        # ─────────────────────────────────────────────────────
        # 4. Create Account Manager user (am@gmail.com)
        # ─────────────────────────────────────────────────────
        am_user = db.execute(
            select(User).where(User.email == "am@gmail.com")
        ).scalar_one_or_none()

        if am_user is None:
            am_user = User(
                email="am@gmail.com",
                password_hash=hash_password("am123"),
                full_name="Test Account Manager",
                role=UserRole.ACCOUNT_MANAGER,
                is_active=True,
            )
            db.add(am_user)
            db.commit()
            db.refresh(am_user)
            print(f"  [CREATED] AM User: am@gmail.com (id={am_user.id})")
        else:
            print(f"  [EXISTS]  AM User: am@gmail.com (id={am_user.id})")

        # ─────────────────────────────────────────────────────
        # 5. Assign the Client to the AM
        # ─────────────────────────────────────────────────────
        assignment = db.execute(
            select(ClientAssignment).where(
                ClientAssignment.user_id == am_user.id,
                ClientAssignment.client_id == client_record.id,
            )
        ).scalar_one_or_none()

        if assignment is None:
            assignment = ClientAssignment(
                user_id=am_user.id,
                client_id=client_record.id,
            )
            db.add(assignment)
            db.commit()
            print(f"  [CREATED] Assignment: AM (id={am_user.id}) -> Client (id={client_record.id})")
        else:
            print(f"  [EXISTS]  Assignment: AM (id={am_user.id}) -> Client (id={client_record.id})")

        # ─────────────────────────────────────────────────────
        # Summary
        # ─────────────────────────────────────────────────────
        print("\n" + "=" * 60)
        print("TEST ACCOUNTS READY")
        print("=" * 60)
        print(f"  ADMIN:   admin@gmail.com   / admin123")
        print(f"  AM:      am@gmail.com      / am123      (assigned to client id={client_record.id})")
        print(f"  VENDOR:  vendor@gmail.com   / vendor123  (linked to vendor id={vendor_record.id})")
        print("=" * 60)

    finally:
        db.close()


if __name__ == "__main__":
    main()
