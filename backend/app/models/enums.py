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


class SOStatus(str, enum.Enum):
    """
    Sales Order status – tracks INVOICING only (not delivery).

    Delivery tracking lives entirely on Purchase Orders / PO Lines.

    M1 values (DB-compatible):
      • PENDING           – default; no invoicing yet
      • PARTIAL_DELIVERED  – legacy name; will be replaced in M2
      • DELIVERED          – legacy name; will be replaced in M2

    M2 will add: PARTIAL_INVOICED, FULLY_INVOICED via migration.
    """
    PENDING = "pending"
    PARTIAL_DELIVERED = "partial_delivered"  # Legacy – kept for DB compat
    DELIVERED = "delivered"                  # Legacy – kept for DB compat


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
    Purchase Order status – moves through a fixed sequence.
    Drop-ship: IN_PRODUCTION → PACKED_AND_SHIPPED → DELIVERED
    In-house:  IN_PRODUCTION → PACKED_AND_SHIPPED → READY_FOR_PICKUP → DELIVERED
    """
    IN_PRODUCTION = "in_production"
    PACKED_AND_SHIPPED = "packed_and_shipped"
    READY_FOR_PICKUP = "ready_for_pickup"  # in-house only
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
