"""
SalesOrder and SOLine models.

SalesOrder
──────────
The record of what a customer ordered.  Starting point for everything
else: Purchase Orders, fulfillment, invoicing, and payments all tie
back to the original SO.

• order_number  – pulled from the customer's PDF where possible.
• order_date    – date the customer placed the order (from their PO).
• due_date      – overall due date for the entire Sales Order.
• status        – tracks INVOICING progress only.
                  Pending → Partial Invoiced → Fully Invoiced (M2).

NOTE: All shipment/delivery tracking lives on Purchase Order lines.
      Sales Orders track ONLY invoicing: what has been invoiced,
      what hasn't, and outstanding receivables.

SOLine
──────
Each row is one SKU on the order.  Tracks:
  ordered_qty   – how many the customer wants
  unit_price    – locked at SO creation from the tier pricing table
  due_date      – per-line due date (each SKU can have a different due date)
  invoiced_qty  – running total from invoice lines (Milestone 2)
"""

import datetime as _dt
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Date,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import SOStatus

if TYPE_CHECKING:
    from app.models.client import Client, ClientAddress
    from app.models.purchase_order import PurchaseOrder
    from app.models.sku import SKU
    from app.models.user import User


class SalesOrder(Base, TimestampMixin):
    __tablename__ = "sales_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_number: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True,
    )
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id"), nullable=False, index=True,
    )
    ship_to_address_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("client_addresses.id"), nullable=True,
    )
    status: Mapped[SOStatus] = mapped_column(
        SAEnum(SOStatus, name="so_status", create_constraint=True),
        nullable=False,
        default=SOStatus.PENDING,
        index=True,
    )

    # ── Date fields ───────────────────────────────────────
    order_date: Mapped[Optional[_dt.date]] = mapped_column(
        Date, nullable=True,
        comment="Date the customer placed the order (from their PO)",
    )
    due_date: Mapped[Optional[_dt.date]] = mapped_column(
        Date, nullable=True,
        comment="Overall due date for the entire Sales Order",
    )

    original_pdf_url: Mapped[Optional[str]] = mapped_column(String(500))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False,
    )

    # ── Relationships ──────────────────────────────────────
    client: Mapped["Client"] = relationship("Client", back_populates="sales_orders")
    ship_to_address: Mapped[Optional["ClientAddress"]] = relationship("ClientAddress")
    creator: Mapped["User"] = relationship("User")
    lines: Mapped[list["SOLine"]] = relationship(
        "SOLine",
        back_populates="sales_order",
        cascade="all, delete-orphan",
        order_by="SOLine.line_number",
    )
    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(
        "PurchaseOrder", back_populates="sales_order",
    )

    def __repr__(self) -> str:
        return f"<SalesOrder id={self.id} number={self.order_number!r} status={self.status.value}>"


class SOLine(Base, TimestampMixin):
    __tablename__ = "so_lines"
    __table_args__ = (
        UniqueConstraint(
            "sales_order_id", "line_number",
            name="uq_so_line_number",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    sales_order_id: Mapped[int] = mapped_column(
        ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    sku_id: Mapped[int] = mapped_column(
        ForeignKey("skus.id"), nullable=False,
    )
    line_number: Mapped[int] = mapped_column(
        Integer, nullable=False,
        comment="Position of this line within the Sales Order (1-based)",
    )
    ordered_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False,
        comment="Locked at SO creation from tier pricing – never changes",
    )

    # ── Per-line due date ─────────────────────────────────
    due_date: Mapped[Optional[_dt.date]] = mapped_column(
        Date, nullable=True,
        comment="Per-line-item due date (from customer PO – each SKU can have a different due date)",
    )

    # NOTE: delivered_qty is NO LONGER on SOLine.
    #       ALL delivery tracking lives on PO lines (POLine.delivered_qty).

    invoiced_qty: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
        comment="Sum of all invoice line quantities (Milestone 2)",
    )

    # ── Relationships ──────────────────────────────────────
    sales_order: Mapped["SalesOrder"] = relationship(
        "SalesOrder", back_populates="lines",
    )
    sku: Mapped["SKU"] = relationship("SKU")

    @property
    def uninvoiced_qty(self) -> int:
        """Units not yet invoiced (for receivables tracking)."""
        return self.ordered_qty - self.invoiced_qty

    def __repr__(self) -> str:
        return (
            f"<SOLine id={self.id} so={self.sales_order_id} "
            f"sku={self.sku_id} ordered={self.ordered_qty}>"
        )
