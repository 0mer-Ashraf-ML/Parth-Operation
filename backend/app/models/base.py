"""
SQLAlchemy declarative base and reusable mixins.
"""

from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """
    Base class for every model in the project.
    Alembic's env.py uses Base.metadata to auto-generate migrations.
    """
    pass


class TimestampMixin:
    """
    Adds `created_at` and `updated_at` columns to any model.

    • created_at  – set automatically on INSERT (DB server time).
    • updated_at  – set on INSERT and re-set on every UPDATE.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
