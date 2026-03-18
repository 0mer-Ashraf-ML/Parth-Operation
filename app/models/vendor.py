"""
Vendor model – suppliers who manufacture or source products.

Vendors log into the platform and can only see their own Purchase Orders.
They cannot see client details, invoices, pricing, or other vendors' data.
"""

from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.purchase_order import PurchaseOrder
    from app.models.sku import SKUVendor
    from app.models.user import User


class Vendor(Base, TimestampMixin):
    __tablename__ = "vendors"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_name: Mapped[Optional[str]] = mapped_column(String(255))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(50))
    lead_time_weeks: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, default=None,
        comment="Typical manufacturing/delivery lead time in weeks",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # ── Relationships ──────────────────────────────────────
    users: Mapped[list["User"]] = relationship(
        "User", back_populates="vendor",
    )
    sku_vendors: Mapped[list["SKUVendor"]] = relationship(
        "SKUVendor", back_populates="vendor",
    )
    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(
        "PurchaseOrder", back_populates="vendor",
    )

    def __repr__(self) -> str:
        return f"<Vendor id={self.id} name={self.company_name!r}>"
