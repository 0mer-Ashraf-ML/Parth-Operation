"""
Client, ClientContact, and ClientAddress models.

Clients are the companies the business sells to.  They do NOT log into
the platform – they are profiles stored in the system.

Key fields:
  • payment_terms    – Net 30 / 45 / 60 / 90  (days to pay after invoice)
  • tax_percentage   – default tax % applied on invoices
  • discount_percentage – default discount % if negotiated
  • auto_invoice     – when True, invoice is created automatically on delivery

Each client can have:
  • Multiple contacts   (main, secondary, accounting)
  • Multiple ship-to addresses  (some clients ship to many locations)
"""

from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import ContactType

if TYPE_CHECKING:
    from app.models.sales_order import SalesOrder
    from app.models.user import ClientAssignment


class Client(Base, TimestampMixin):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_name: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True,
    )
    payment_terms: Mapped[int] = mapped_column(
        Integer, nullable=False, default=30,
        comment="Net payment days: 30, 45, 60, or 90",
    )
    tax_percentage: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=0,
    )
    discount_percentage: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=0,
    )
    auto_invoice: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="If True, invoices are created automatically when delivery is recorded",
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # ── Relationships ──────────────────────────────────────
    contacts: Mapped[list["ClientContact"]] = relationship(
        "ClientContact", back_populates="client", cascade="all, delete-orphan",
    )
    addresses: Mapped[list["ClientAddress"]] = relationship(
        "ClientAddress", back_populates="client", cascade="all, delete-orphan",
    )
    assigned_users: Mapped[list["ClientAssignment"]] = relationship(
        "ClientAssignment", back_populates="client",
    )
    sales_orders: Mapped[list["SalesOrder"]] = relationship(
        "SalesOrder", back_populates="client",
    )

    def __repr__(self) -> str:
        return f"<Client id={self.id} name={self.company_name!r}>"


class ClientContact(Base, TimestampMixin):
    __tablename__ = "client_contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    contact_type: Mapped[ContactType] = mapped_column(
        SAEnum(ContactType, name="contact_type", create_constraint=True),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(50))

    # ── Relationships ──────────────────────────────────────
    client: Mapped["Client"] = relationship("Client", back_populates="contacts")

    def __repr__(self) -> str:
        return f"<ClientContact id={self.id} type={self.contact_type.value} name={self.name!r}>"


class ClientAddress(Base, TimestampMixin):
    __tablename__ = "client_addresses"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    label: Mapped[str] = mapped_column(
        String(255), nullable=False,
        comment="Friendly label, e.g. 'Main Warehouse', 'HQ Office'",
    )
    address_line_1: Mapped[str] = mapped_column(String(255), nullable=False)
    address_line_2: Mapped[Optional[str]] = mapped_column(String(255))
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    zip_code: Mapped[str] = mapped_column(String(20), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="US")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # ── Relationships ──────────────────────────────────────
    client: Mapped["Client"] = relationship("Client", back_populates="addresses")

    def __repr__(self) -> str:
        return f"<ClientAddress id={self.id} label={self.label!r}>"
