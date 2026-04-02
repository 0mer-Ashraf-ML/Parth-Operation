"""add ship_date to purchase_orders (set when status becomes COMPLETED)

Revision ID: f3a9c1d2e4b5
Revises: 8b41cab80a08
Create Date: 2026-04-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f3a9c1d2e4b5"
down_revision: Union[str, None] = "8b41cab80a08"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "purchase_orders",
        sa.Column(
            "ship_date",
            sa.Date(),
            nullable=True,
            comment="Auto-set when PO status becomes COMPLETED (completion / ship date)",
        ),
    )
    # Backfill completed POs using updated_at (UTC) as best-effort ship date (PostgreSQL)
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            sa.text(
                """
                UPDATE purchase_orders
                SET ship_date = (updated_at AT TIME ZONE 'UTC')::date
                WHERE ship_date IS NULL
                  AND status::text = 'completed'
                """
            )
        )


def downgrade() -> None:
    op.drop_column("purchase_orders", "ship_date")
