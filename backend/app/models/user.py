"""
User and ClientAssignment models.

Users
─────
Three roles: Admin, Account Manager, Vendor.
• Admin           – full access to the entire platform.
• Account Manager – access limited to assigned clients only.
• Vendor          – access limited to their own Purchase Orders.

A user with role=VENDOR is linked to a Vendor record via vendor_id.

ClientAssignment
────────────────
Maps Account Managers → the clients they are allowed to access.
One row per (user, client) pair.  Unique constraint prevents duplicates.
"""

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import UserRole

if TYPE_CHECKING:
    from app.models.audit import AuditLog
    from app.models.vendor import Vendor


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True,
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role", create_constraint=True),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Only populated when role == VENDOR
    vendor_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("vendors.id"), nullable=True,
    )

    # ── Relationships ──────────────────────────────────────
    vendor: Mapped[Optional["Vendor"]] = relationship(
        "Vendor", back_populates="users",
    )
    assigned_clients: Mapped[list["ClientAssignment"]] = relationship(
        "ClientAssignment", back_populates="user",
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog", back_populates="user",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r} role={self.role.value}>"


class ClientAssignment(Base):
    """
    Joins an Account Manager to the clients they can access.
    The JWT token carries these client IDs so queries can filter at the DB level.
    """

    __tablename__ = "client_assignments"
    __table_args__ = (
        UniqueConstraint("user_id", "client_id", name="uq_user_client_assignment"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    # ── Relationships ──────────────────────────────────────
    user: Mapped["User"] = relationship("User", back_populates="assigned_clients")
    client = relationship("Client", back_populates="assigned_users")

    def __repr__(self) -> str:
        return f"<ClientAssignment user_id={self.user_id} client_id={self.client_id}>"
