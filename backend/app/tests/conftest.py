import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Needed before importing app modules because settings are evaluated at import time.
os.environ.setdefault("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'test_bootstrap.db'}")
os.environ.setdefault("JWT_SECRET", "test-secret-key")

import app.models  # noqa: F401
from app.database import get_db
from app.main import app as fastapi_app
from app.models.base import Base
from app.models.client import Client, ClientAddress, ClientContact
from app.models.fulfillment import FulfillmentEvent
from app.models.purchase_order import POLine, PurchaseOrder
from app.models.sales_order import SOLine, SalesOrder
from app.models.sku import SKU, SKUVendor, TierPricing
from app.models.user import ClientAssignment, User
from app.models.vendor import Vendor, VendorAddress


TEST_TABLES = [
    Vendor.__table__,
    VendorAddress.__table__,
    User.__table__,
    Client.__table__,
    ClientAddress.__table__,
    ClientContact.__table__,
    ClientAssignment.__table__,
    SKU.__table__,
    SKUVendor.__table__,
    TierPricing.__table__,
    SalesOrder.__table__,
    SOLine.__table__,
    PurchaseOrder.__table__,
    POLine.__table__,
    FulfillmentEvent.__table__,
]


@pytest.fixture()
def db_engine(tmp_path):
    db_path = tmp_path / "test.sqlite3"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine, tables=TEST_TABLES)
    yield engine
    Base.metadata.drop_all(engine, tables=list(reversed(TEST_TABLES)))
    engine.dispose()


@pytest.fixture()
def SessionLocal(db_engine):
    return sessionmaker(bind=db_engine, autocommit=False, autoflush=False)


@pytest.fixture()
def db_session(SessionLocal):
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def app(SessionLocal):
    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    fastapi_app.dependency_overrides[get_db] = override_get_db
    yield fastapi_app
    fastapi_app.dependency_overrides.clear()


@pytest.fixture()
def client(app):
    with TestClient(app) as test_client:
        yield test_client
