"""
SKU, SKUVendor, and TierPricing models.

SKU  (Stock Keeping Unit)
─────────────────────────
Every product the business sells has a SKU with a unique code.
Each SKU has a default vendor and an optional list of alternate vendors.

Tiered Pricing
──────────────
Price-per-unit depends on how many the customer orders.
Example:  1–999 = $3.00 | 1,000–4,999 = $2.75 | 5,000+ = $2.50
When a Sales Order is created, the system locks the correct tier
price onto the SO line – it never changes after that.

Inventory Tracking
──────────────────
Off by default (most items are custom-order).  When turned on the
system keeps a running count that adjusts with POs and deliveries.
"""

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.vendor import Vendor


class SKU(Base, TimestampMixin):
    __tablename__ = "skus"

    id: Mapped[int] = mapped_column(primary_key=True)
    sku_code: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    default_vendor_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("vendors.id"), nullable=True,
    )
    secondary_vendor_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("vendors.id"), nullable=True,
        comment="Backup vendor used when default vendor cannot fulfil",
    )
    track_inventory: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Enable running inventory count for stocked SKUs",
    )
    inventory_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
        comment="Current available units (only meaningful when track_inventory=True)",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # ── Relationships ──────────────────────────────────────
    default_vendor: Mapped[Optional["Vendor"]] = relationship(
        "Vendor", foreign_keys=[default_vendor_id],
    )
    secondary_vendor: Mapped[Optional["Vendor"]] = relationship(
        "Vendor", foreign_keys=[secondary_vendor_id],
    )
    sku_vendors: Mapped[list["SKUVendor"]] = relationship(
        "SKUVendor", back_populates="sku", cascade="all, delete-orphan",
    )
    tier_prices: Mapped[list["TierPricing"]] = relationship(
        "TierPricing",
        back_populates="sku",
        cascade="all, delete-orphan",
        order_by="TierPricing.min_qty",
    )

    def __repr__(self) -> str:
        return f"<SKU id={self.id} code={self.sku_code!r}>"


class SKUVendor(Base):
    """
    Maps a SKU to all vendors that can supply it.
    One vendor per SKU can be flagged as the default.
    """

    __tablename__ = "sku_vendors"
    __table_args__ = (
        UniqueConstraint("sku_id", "vendor_id", name="uq_sku_vendor"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    sku_id: Mapped[int] = mapped_column(
        ForeignKey("skus.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    vendor_id: Mapped[int] = mapped_column(
        ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    # ── Relationships ──────────────────────────────────────
    sku: Mapped["SKU"] = relationship("SKU", back_populates="sku_vendors")
    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="sku_vendors")

    def __repr__(self) -> str:
        return f"<SKUVendor sku_id={self.sku_id} vendor_id={self.vendor_id}>"


class TierPricing(Base, TimestampMixin):
    """
    Quantity-based pricing for a SKU.
    max_qty = NULL means "and above" (the highest tier).
    """

    __tablename__ = "tier_pricing"

    id: Mapped[int] = mapped_column(primary_key=True)
    sku_id: Mapped[int] = mapped_column(
        ForeignKey("skus.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    min_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    max_qty: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True,
        comment="NULL = unlimited (highest tier)",
    )
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False,
        comment="Price per unit in USD",
    )

    # ── Relationships ──────────────────────────────────────
    sku: Mapped["SKU"] = relationship("SKU", back_populates="tier_prices")

    def __repr__(self) -> str:
        return f"<TierPricing sku_id={self.sku_id} {self.min_qty}-{self.max_qty} @ ${self.unit_price}>"
