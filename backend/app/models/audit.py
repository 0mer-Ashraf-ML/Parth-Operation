"""
AuditLog model – records every action taken by every user.

This includes:
  • Normal UI actions  (create client, update SO, etc.)
  • AI-initiated actions  (AI creating a client, looking up data, etc.)
  • System actions  (auto-generated POs, status derivations, etc.)
  • Blocked actions  (permission denied attempts)

The audit log is append-only.  Rows are never updated or deleted.
"""

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import EventSource

if TYPE_CHECKING:
    from app.models.user import User


class AuditLog(Base):
    """
    Immutable log entry.  No updated_at because rows are never modified.
    """

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True,
        comment="NULL for unauthenticated or pure-system actions",
    )
    action: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="Verb describing the action, e.g. 'create_client', 'update_po_status'",
    )
    entity_type: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="Table/model name, e.g. 'client', 'sales_order'",
    )
    entity_id: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True,
        comment="Primary key of the affected record",
    )
    details: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True,
        comment="Arbitrary JSON payload with before/after values, inputs, etc.",
    )
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    source: Mapped[EventSource] = mapped_column(
        SAEnum(EventSource, name="event_source", create_constraint=True, create_type=False),
        nullable=False,
        default=EventSource.UI,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # ── Relationships ──────────────────────────────────────
    user: Mapped[Optional["User"]] = relationship("User", back_populates="audit_logs")

    def __repr__(self) -> str:
        return (
            f"<AuditLog id={self.id} action={self.action!r} "
            f"entity={self.entity_type}:{self.entity_id}>"
        )
