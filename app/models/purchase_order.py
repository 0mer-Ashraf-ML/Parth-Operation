"""
PurchaseOrder and POLine models.

PurchaseOrder
─────────────
When a Sales Order is confirmed, the system automatically splits the
order by vendor and creates one PO per vendor.
  Example: SO-1025 has SKUs from Vendor A and B
           → PO-1025-A  (Vendor A's portion)
           → PO-1025-B  (Vendor B's portion)

Vendors log in and only see their own POs.  They move the status
through a fixed flow depending on shipment type.

All shipment/delivery tracking lives here – NOT on the Sales Order.
  • expected_ship_date    – when vendor expects to ship goods
  • expected_arrival_date – when goods arrive at warehouse or client (drop-ship)
Both are updated by the vendor so the business always knows the schedule.

POLine
──────
Each row maps back to one SO line.  This lets us trace every PO item
directly to the customer order that triggered it.
Per-line dates allow tracking when individual SKUs within a PO have
different due dates or expected shipment schedules.
"""

import datetime as _dt
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import POStatus, ShipmentType

if TYPE_CHECKING:
    from app.models.sales_order import SalesOrder, SOLine
    from app.models.sku import SKU
    from app.models.vendor import Vendor


class PurchaseOrder(Base, TimestampMixin):
    __tablename__ = "purchase_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    po_number: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True,
    )
    sales_order_id: Mapped[int] = mapped_column(
        ForeignKey("sales_orders.id"), nullable=False, index=True,
    )
    vendor_id: Mapped[int] = mapped_column(
        ForeignKey("vendors.id"), nullable=False, index=True,
    )
    shipment_type: Mapped[ShipmentType] = mapped_column(
        SAEnum(ShipmentType, name="shipment_type", create_constraint=True),
        nullable=False,
    )
    status: Mapped[POStatus] = mapped_column(
        SAEnum(POStatus, name="po_status", create_constraint=True),
        nullable=False,
        default=POStatus.IN_PRODUCTION,
    )

    # ── Date fields (updated by vendor) ───────────────────
    expected_ship_date: Mapped[Optional[_dt.date]] = mapped_column(
        Date, nullable=True,
        comment="When vendor expects to ship goods (updated by vendor)",
    )
    expected_arrival_date: Mapped[Optional[_dt.date]] = mapped_column(
        Date, nullable=True,
        comment="When goods are expected to arrive at warehouse or client (updated by vendor)",
    )

    # ── Relationships ──────────────────────────────────────
    sales_order: Mapped["SalesOrder"] = relationship(
        "SalesOrder", back_populates="purchase_orders",
    )
    vendor: Mapped["Vendor"] = relationship(
        "Vendor", back_populates="purchase_orders",
    )
    lines: Mapped[list["POLine"]] = relationship(
        "POLine", back_populates="purchase_order", cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<PurchaseOrder id={self.id} number={self.po_number!r} "
            f"status={self.status.value}>"
        )


class POLine(Base):
    """
    One item on a Purchase Order, linking back to the originating SO line.

    Per-line dates allow granular tracking when each SKU in an order
    has a different due date or expected shipment schedule.
    """

    __tablename__ = "po_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_order_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    so_line_id: Mapped[int] = mapped_column(
        ForeignKey("so_lines.id"), nullable=False,
    )
    sku_id: Mapped[int] = mapped_column(
        ForeignKey("skus.id"), nullable=False,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    # ── Per-line date fields ──────────────────────────────
    due_date: Mapped[Optional[_dt.date]] = mapped_column(
        Date, nullable=True,
        comment="Per-line due date (inherited from the originating SO line)",
    )
    expected_ship_date: Mapped[Optional[_dt.date]] = mapped_column(
        Date, nullable=True,
        comment="Per-line expected ship date (vendor can update individually)",
    )
    expected_arrival_date: Mapped[Optional[_dt.date]] = mapped_column(
        Date, nullable=True,
        comment="Per-line expected arrival date (vendor can update individually)",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    # ── Relationships ──────────────────────────────────────
    purchase_order: Mapped["PurchaseOrder"] = relationship(
        "PurchaseOrder", back_populates="lines",
    )
    so_line: Mapped["SOLine"] = relationship("SOLine")
    sku: Mapped["SKU"] = relationship("SKU")

    def __repr__(self) -> str:
        return f"<POLine id={self.id} po={self.purchase_order_id} sku={self.sku_id} qty={self.quantity}>"
