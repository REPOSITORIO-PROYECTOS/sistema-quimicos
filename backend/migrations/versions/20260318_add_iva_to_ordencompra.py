"""Add iva field to ordenes_compra table."""
from alembic import op
import sqlalchemy as sa

revision = '20260318_add_iva_to_ordencompra'
down_revision = '20260316_fix_importe_abonado_default'
branch_labels = None
depends_on = None


def upgrade():
    # Add iva column to ordenes_compra
    op.add_column(
        'ordenes_compra',
        sa.Column('iva', sa.String(50), nullable=True)
    )


def downgrade():
    # Remove iva column
    op.drop_column('ordenes_compra', 'iva')
