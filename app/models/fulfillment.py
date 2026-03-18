"""
FulfillmentEvent model – append-only delivery log (PO-line-centric).

Every time goods are delivered against a PO line, a new row is
inserted.  These rows are NEVER edited or deleted — they form a
permanent, auditable history of every delivery event.

The delivered_qty on the PO line is the SUM of all fulfillment events
for that line.

Fields:
  • po_line_id   – which PO line this delivery applies to (REQUIRED)
  • quantity     – how many units arrived in this event
  • recorded_by  – which user recorded the delivery
  • source       – whether it was recorded via UI or AI chat
  • notes        – optional free text (e.g. "partial shipment, rest ETA next week")

Note: Delivery tracking lives ENTIRELY on the PO side.
      Sales Orders track only invoicing / receivables.
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
    from app.models.user import User


class FulfillmentEvent(Base):
    """
    Immutable delivery record.  No updated_at column because rows
    are never modified after creation.

    Primary link is to po_line_id (PO line).  The SO line can be
    traced via POLine.so_line_id when needed.
    """

    __tablename__ = "fulfillment_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    po_line_id: Mapped[int] = mapped_column(
        ForeignKey("po_lines.id"), nullable=False, index=True,
        comment="PO line this delivery applies to (REQUIRED)",
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
    po_line: Mapped["POLine"] = relationship(
        "POLine", back_populates="fulfillment_events",
    )
    recorder: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return (
            f"<FulfillmentEvent id={self.id} po_line={self.po_line_id} "
            f"qty={self.quantity} source={self.source.value}>"
        )
