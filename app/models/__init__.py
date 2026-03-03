"""
Central model registry.

Every SQLAlchemy model is imported here so that:
  1. Alembic can auto-detect all tables for migrations.
  2. Other modules can do:  from app.models import User, Client, ...
"""

from app.models.base import Base, TimestampMixin  # noqa: F401

from app.models.vendor import Vendor  # noqa: F401
from app.models.user import User, ClientAssignment  # noqa: F401
from app.models.client import Client, ClientContact, ClientAddress  # noqa: F401
from app.models.sku import SKU, SKUVendor, TierPricing  # noqa: F401
from app.models.sales_order import SalesOrder, SOLine  # noqa: F401
from app.models.purchase_order import PurchaseOrder, POLine  # noqa: F401
from app.models.fulfillment import FulfillmentEvent  # noqa: F401
from app.models.audit import AuditLog  # noqa: F401
