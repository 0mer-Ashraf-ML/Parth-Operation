"""add delivered_date to po_lines (set when line status becomes DELIVERED)

Revision ID: a7b8c9d0e1f2
Revises: f3a9c1d2e4b5
Create Date: 2026-03-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f3a9c1d2e4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "po_lines",
        sa.Column(
            "delivered_date",
            sa.Date(),
            nullable=True,
            comment="UTC calendar date when line first reached DELIVERED",
        ),
    )
    op.execute(
        sa.text(
            """
            UPDATE po_lines
            SET delivered_date = (created_at AT TIME ZONE 'UTC')::date
            WHERE status = 'DELIVERED'::po_line_status
              AND delivered_date IS NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_column("po_lines", "delivered_date")
