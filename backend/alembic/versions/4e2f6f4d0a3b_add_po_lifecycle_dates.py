"""add_po_lifecycle_dates

Add PO completion timestamp plus actual delivered/received timestamps on PO lines.

Revision ID: 4e2f6f4d0a3b
Revises: 8b41cab80a08
Create Date: 2026-03-31 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4e2f6f4d0a3b"
down_revision: Union[str, None] = "8b41cab80a08"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "purchase_orders",
        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="When this PO was actually completed",
        ),
    )
    op.add_column(
        "po_lines",
        sa.Column(
            "delivered_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Actual delivery timestamp for drop-ship completion",
        ),
    )
    op.add_column(
        "po_lines",
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Actual receipt timestamp for in-house warehouse receipt",
        ),
    )


def downgrade() -> None:
    op.drop_column("po_lines", "received_at")
    op.drop_column("po_lines", "delivered_at")
    op.drop_column("purchase_orders", "completed_at")
