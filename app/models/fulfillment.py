"""
FulfillmentEvent model – append-only delivery log.

Every time goods are delivered against an SO line, a new row is
inserted.  These rows are NEVER edited or deleted — they form a
permanent, auditable history of every delivery event.

The deliveredQty on the SO line is the SUM of all fulfillment events
for that line.

Fields:
  • so_line_id   – which SO line this delivery applies to
  • po_line_id   – optional link to the PO line (for traceability)
  • quantity     – how many units arrived in this event
  • recorded_by  – which user recorded the delivery
  • source       – whether it was recorded via UI or AI chat
  • notes        – optional free text (e.g. "partial shipment, rest ETA next week")
"""

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import EventSource

if TYPE_CHECKING:
    from app.models.purchase_order import POLine
    from app.models.sales_order import SOLine
    from app.models.user import User


class FulfillmentEvent(Base):
    """
    Immutable delivery record.  No updated_at column because rows
    are never modified after creation.
    """

    __tablename__ = "fulfillment_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    so_line_id: Mapped[int] = mapped_column(
        ForeignKey("so_lines.id"), nullable=False, index=True,
    )
    po_line_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("po_lines.id"), nullable=True,
    )
    quantity: Mapped[int] = mapped_column(
        Integer, nullable=False,
        comment="Number of units delivered in this event",
    )
    recorded_by: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False,
    )
    source: Mapped[EventSource] = mapped_column(
        SAEnum(EventSource, name="event_source", create_constraint=True),
        nullable=False,
        comment="Whether recorded via UI or AI chat",
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # ── Relationships ──────────────────────────────────────
    so_line: Mapped["SOLine"] = relationship(
        "SOLine", back_populates="fulfillment_events",
    )
    po_line: Mapped[Optional["POLine"]] = relationship("POLine")
    recorder: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return (
            f"<FulfillmentEvent id={self.id} so_line={self.so_line_id} "
            f"qty={self.quantity} source={self.source.value}>"
        )
