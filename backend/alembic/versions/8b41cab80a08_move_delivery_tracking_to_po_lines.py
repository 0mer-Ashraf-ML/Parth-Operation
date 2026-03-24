"""move_delivery_tracking_to_po_lines

Architectural change: delivery tracking moves from SO lines → PO lines.
  - SO tracks INVOICING only
  - PO tracks ALL delivery/shipment

Revision ID: 8b41cab80a08
Revises: d8d0bb980271
Create Date: 2026-03-18 23:30:24.455546

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8b41cab80a08'
down_revision: Union[str, None] = 'd8d0bb980271'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Create new POLineStatus enum in PostgreSQL ─────
    po_line_status_enum = sa.Enum(
        'IN_PRODUCTION', 'PACKED_AND_SHIPPED', 'READY_FOR_PICKUP', 'DELIVERED',
        name='po_line_status',
    )
    po_line_status_enum.create(op.get_bind(), checkfirst=True)

    # NOTE: New SOStatus enum values (partial_invoiced, fully_invoiced)
    # will be added in a future migration when invoicing is built (M2).
    # ALTER TYPE ADD VALUE cannot safely run inside a transaction.

    # ── 2. Add delivery columns to PO lines ───────────────
    op.add_column('po_lines', sa.Column(
        'status',
        sa.Enum('IN_PRODUCTION', 'PACKED_AND_SHIPPED', 'READY_FOR_PICKUP', 'DELIVERED',
                name='po_line_status', create_constraint=True),
        server_default='IN_PRODUCTION',
        nullable=False,
        comment='Per-line delivery status - each line tracks independently',
    ))
    op.add_column('po_lines', sa.Column(
        'delivered_qty',
        sa.Integer(),
        server_default='0',
        nullable=False,
        comment='Sum of all fulfillment events for this PO line',
    ))

    # ── 3. Handle existing fulfillment_events ─────────────
    #    Delete any events that don't have a po_line_id
    #    (these are orphaned SO-only events from the old model)
    op.execute(
        sa.text("DELETE FROM fulfillment_events WHERE po_line_id IS NULL")
    )

    # ── 4. Make po_line_id NOT NULL, add index ────────────
    op.alter_column('fulfillment_events', 'po_line_id',
                    existing_type=sa.INTEGER(),
                    nullable=False,
                    comment='PO line this delivery applies to (REQUIRED)')
    op.create_index(
        op.f('ix_fulfillment_events_po_line_id'),
        'fulfillment_events', ['po_line_id'], unique=False,
    )

    # ── 5. Drop old SO-centric columns from fulfillment_events ──
    op.drop_index('ix_fulfillment_events_so_line_id', table_name='fulfillment_events')
    op.drop_constraint('fulfillment_events_so_line_id_fkey', 'fulfillment_events', type_='foreignkey')
    op.drop_column('fulfillment_events', 'so_line_id')

    # ── 6. Remove delivered_qty from SO lines ─────────────
    op.drop_column('so_lines', 'delivered_qty')


def downgrade() -> None:
    # Reverse: add delivered_qty back to so_lines
    op.add_column('so_lines', sa.Column(
        'delivered_qty', sa.INTEGER(),
        server_default='0',
        autoincrement=False,
        nullable=False,
        comment='Sum of all fulfillment events for this line',
    ))

    # Reverse: add so_line_id back to fulfillment_events
    op.add_column('fulfillment_events', sa.Column(
        'so_line_id', sa.INTEGER(), autoincrement=False, nullable=True,
    ))
    op.create_foreign_key(
        'fulfillment_events_so_line_id_fkey',
        'fulfillment_events', 'so_lines', ['so_line_id'], ['id'],
    )
    op.create_index('ix_fulfillment_events_so_line_id', 'fulfillment_events', ['so_line_id'], unique=False)

    # Reverse: make po_line_id nullable again
    op.drop_index(op.f('ix_fulfillment_events_po_line_id'), table_name='fulfillment_events')
    op.alter_column('fulfillment_events', 'po_line_id',
                    existing_type=sa.INTEGER(),
                    nullable=True,
                    comment=None)

    # Reverse: drop delivery columns from po_lines
    op.drop_column('po_lines', 'delivered_qty')
    op.drop_column('po_lines', 'status')

    # Drop the enum type
    sa.Enum(name='po_line_status').drop(op.get_bind(), checkfirst=True)
