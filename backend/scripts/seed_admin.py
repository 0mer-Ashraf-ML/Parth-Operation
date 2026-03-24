"""
Seed script – creates an initial Admin user for testing.

Run from the project root:
    python -m scripts.seed_admin

If the admin already exists (same email), it will skip creation.
"""

import sys
import os

# Ensure project root is on the path so `app` package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.database import SessionLocal
from app.models.enums import UserRole
from app.models.user import User
from app.services.auth import hash_password

# ── Configuration ──────────────────────────────────────────
ADMIN_EMAIL = "admin@gmail.com"
ADMIN_PASSWORD = "admin123"
ADMIN_NAME = "System Admin"


def main() -> None:
    db = SessionLocal()
    try:
        existing = db.execute(
            select(User).where(User.email == ADMIN_EMAIL)
        ).scalar_one_or_none()

        if existing:
            print(f"Admin user already exists: {ADMIN_EMAIL} (id={existing.id})")
            return

        admin = User(
            email=ADMIN_EMAIL,
            password_hash=hash_password(ADMIN_PASSWORD),
            full_name=ADMIN_NAME,
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

        print("Admin user created successfully!")
        print(f"  Email:    {ADMIN_EMAIL}")
        print(f"  Password: {ADMIN_PASSWORD}")
        print(f"  User ID:  {admin.id}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
