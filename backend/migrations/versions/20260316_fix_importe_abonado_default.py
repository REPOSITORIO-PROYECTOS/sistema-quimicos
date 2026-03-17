"""Fix importe_abonado to have default and not nullable."""
from alembic import op
import sqlalchemy as sa
from decimal import Decimal

revision = '20260316_fix_importe_abonado_default'
down_revision = '20251128_add_movimientos_proveedor_table'
branch_labels = None
depends_on = None


def upgrade():
    # Update all NULL values to 0.00
    op.execute(sa.text("""
        UPDATE ordenes_compra 
        SET importe_abonado = 0.00 
        WHERE importe_abonado IS NULL
    """))
    
    # Alter column to be NOT NULL with default
    op.alter_column(
        'ordenes_compra',
        'importe_abonado',
        existing_type=sa.Numeric(15, 2),
        nullable=False,
        existing_nullable=True,
        server_default='0.00'
    )


def downgrade():
    # Revert: allow NULL again
    op.alter_column(
        'ordenes_compra',
        'importe_abonado',
        existing_type=sa.Numeric(15, 2),
        nullable=True,
        existing_nullable=False,
        server_default=None
    )
