"""
Pydantic schemas for SKU, TierPricing, and SKUVendor endpoints.

Note on vendor_cost vs tier pricing:
  • vendor_cost (on SKUVendor) = what WE PAY the vendor per unit.
  • tier pricing (on TierPricing) = what we CHARGE the client.
  Vendors must NEVER see tier pricing data in any response.
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════
#  TIER PRICING
# ═══════════════════════════════════════════════════════════

class TierPricingCreate(BaseModel):
    """One tier row – send as part of SKU creation or on its own."""
    min_qty: int = Field(..., ge=1, examples=[1])
    max_qty: Optional[int] = Field(None, ge=1, examples=[999], description="NULL = unlimited (highest tier)")
    unit_price: Decimal = Field(..., ge=0, decimal_places=2, examples=[Decimal("2.50")])


class TierPricingUpdate(BaseModel):
    min_qty: Optional[int] = Field(None, ge=1)
    max_qty: Optional[int] = Field(None, ge=1)
    unit_price: Optional[Decimal] = Field(None, ge=0, decimal_places=2)


class TierPricingOut(BaseModel):
    id: int
    sku_id: int
    min_qty: int
    max_qty: Optional[int] = None
    unit_price: Decimal

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════
#  SKU ↔ VENDOR MAPPING
# ═══════════════════════════════════════════════════════════

class SKUVendorCreate(BaseModel):
    """Link a vendor to a SKU (with optional vendor cost)."""
    vendor_id: int
    is_default: bool = False
    vendor_cost: Optional[Decimal] = Field(
        None, ge=0, decimal_places=2,
        description="What we pay the vendor per unit (separate from tier pricing)",
        examples=[Decimal("1.75")],
    )


class SKUVendorUpdate(BaseModel):
    """Update a SKU-Vendor mapping (vendor cost, default flag)."""
    is_default: Optional[bool] = None
    vendor_cost: Optional[Decimal] = Field(
        None, ge=0, decimal_places=2,
        description="What we pay the vendor per unit",
    )


class SKUVendorOut(BaseModel):
    id: int
    sku_id: int
    vendor_id: int
    is_default: bool
    vendor_cost: Optional[Decimal] = None
    vendor_name: Optional[str] = None  # populated by the service layer

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════
#  SKU
# ═══════════════════════════════════════════════════════════

class SKUCreate(BaseModel):
    """POST /skus body."""
    sku_code: str = Field(..., min_length=1, max_length=100, examples=["80-003099-A"])
    name: str = Field(..., min_length=1, max_length=255, examples=["BOND BAR ASM U 10IN ATT"])
    description: Optional[str] = None
    default_vendor_id: Optional[int] = None
    secondary_vendor_id: Optional[int] = Field(
        None, description="Backup vendor when default vendor cannot fulfil",
    )
    track_inventory: bool = False
    inventory_count: int = Field(0, ge=0)
    # Nested – create tier prices together with the SKU
    tier_prices: list[TierPricingCreate] = []


class SKUUpdate(BaseModel):
    """PATCH /skus/{id} body."""
    sku_code: Optional[str] = Field(None, min_length=1, max_length=100)
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    default_vendor_id: Optional[int] = None
    secondary_vendor_id: Optional[int] = None
    track_inventory: Optional[bool] = None
    inventory_count: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class SKUListOut(BaseModel):
    """Lightweight representation for list endpoints."""
    id: int
    sku_code: str
    name: str
    default_vendor_id: Optional[int] = None
    secondary_vendor_id: Optional[int] = None
    track_inventory: bool
    inventory_count: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SKUDetailOut(BaseModel):
    """Full representation with tier prices and vendor mappings."""
    id: int
    sku_code: str
    name: str
    description: Optional[str] = None
    default_vendor_id: Optional[int] = None
    secondary_vendor_id: Optional[int] = None
    track_inventory: bool
    inventory_count: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    tier_prices: list[TierPricingOut] = []
    sku_vendors: list[SKUVendorOut] = []

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════
#  ANALYTICS
# ═══════════════════════════════════════════════════════════

class SKUOrderVolumeBreakdown(BaseModel):
    po_number: str
    quantity: int

class SKUOrderVolumeOut(BaseModel):
    sku_id: int
    date_range: str
    total_ordered_quantity: int
    breakdown_by_po: list[SKUOrderVolumeBreakdown] = []
