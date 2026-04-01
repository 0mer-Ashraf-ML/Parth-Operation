"""
Enum types shared across the platform.

These Python enums are used both in SQLAlchemy models (mapped to
PostgreSQL enum columns) and in Pydantic schemas for validation.
"""

import enum


class UserRole(str, enum.Enum):
    """Three fixed roles – determines what a user can see and do."""
    ADMIN = "admin"
    ACCOUNT_MANAGER = "account_manager"
    VENDOR = "vendor"


class ContactType(str, enum.Enum):
    """Type of contact stored on a client profile."""
    MAIN = "main"
    SECONDARY = "secondary"
    ACCOUNTING = "accounting"


class AddressType(str, enum.Enum):
    """
    Type of address on a client or vendor profile.
    Client addresses can be either ship-to or billing.
    """
    SHIP_TO = "ship_to"
    BILLING = "billing"


class SOStatus(str, enum.Enum):
    """
    Sales Order status – auto-derived from PO completion.

    Flow:
      PENDING → STARTED → PARTIALLY_COMPLETED → COMPLETED

    - PENDING:              No POs generated yet (default at creation).
    - STARTED:              POs have been generated.
    - PARTIALLY_COMPLETED:  Some POs completed, some not.
    - COMPLETED:            All POs completed.

    Legacy values (kept for DB backward compat – NOT used in new code):
      • partial_delivered
      • delivered
    """
    PENDING = "pending"
    STARTED = "started"
    PARTIALLY_COMPLETED = "partially_completed"
    COMPLETED = "completed"
    # Legacy – kept only for DB backward compatibility
    PARTIAL_DELIVERED = "partial_delivered"
    DELIVERED = "delivered"


class SOPaymentStatus(str, enum.Enum):
    """
    Payment / invoicing status on a Sales Order.
    Separate from the order-completion status.

    M1: defaults to NOT_INVOICED for all SOs.
    M2: invoicing module will update this field.
    """
    NOT_INVOICED = "not_invoiced"
    PARTIALLY_INVOICED = "partially_invoiced"
    FULLY_PAID = "fully_paid"


class POLineStatus(str, enum.Enum):
    """
    Per-line status on a Purchase Order line item.
    Each PO line tracks its own delivery progress independently.
    Drop-ship: IN_PRODUCTION → PACKED_AND_SHIPPED → DELIVERED
    In-house:  IN_PRODUCTION → PACKED_AND_SHIPPED → READY_FOR_PICKUP → DELIVERED
    """
    IN_PRODUCTION = "in_production"
    PACKED_AND_SHIPPED = "packed_and_shipped"
    READY_FOR_PICKUP = "ready_for_pickup"  # in-house only
    DELIVERED = "delivered"


class POStatus(str, enum.Enum):
    """
    Purchase Order header status – auto-derived from line items.

    - STARTED:   At least one line is not yet DELIVERED (default).
    - COMPLETED: ALL lines are DELIVERED.

    Legacy values (kept for DB backward compat – NOT used in new code):
      • in_production, packed_and_shipped, ready_for_pickup, delivered
    """
    STARTED = "started"
    COMPLETED = "completed"
    # Legacy – kept only for DB backward compatibility
    IN_PRODUCTION = "in_production"
    PACKED_AND_SHIPPED = "packed_and_shipped"
    READY_FOR_PICKUP = "ready_for_pickup"
    DELIVERED = "delivered"


class ShipmentType(str, enum.Enum):
    """Whether the vendor ships directly to the customer or to the business first."""
    DROP_SHIP = "drop_ship"
    IN_HOUSE = "in_house"


class EventSource(str, enum.Enum):
    """Where an action originated – used in fulfillment events and audit logs."""
    UI = "ui"
    AI = "ai"
    SYSTEM = "system"
