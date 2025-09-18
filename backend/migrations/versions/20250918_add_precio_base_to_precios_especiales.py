"""Add usar_precio_base and margen_sobre_base to precios_especiales_cliente

Revision ID: 20250918_add_precio_base
Revises: 20250914_add_moneda_precio
Create Date: 2025-09-18 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250918_add_precio_base'
down_revision = '20250914_add_moneda_precio'
branch_labels = None
depends_on = None


def upgrade():
    # Añadir columna booleana para indicar que el precio especial debe calcularse desde el precio base del producto
    op.add_column('precios_especiales_cliente', sa.Column('usar_precio_base', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    # Añadir columna para margen extra aplicado sobre el precio base (por ejemplo 0.10 = +10%)
    op.add_column('precios_especiales_cliente', sa.Column('margen_sobre_base', sa.Numeric(10, 4), nullable=True))
    # Crear índice para acelerar consultas filtrando por usar_precio_base si hace falta
    op.create_index('ix_precios_usar_precio_base', 'precios_especiales_cliente', ['usar_precio_base'])


def downgrade():
    op.drop_index('ix_precios_usar_precio_base', table_name='precios_especiales_cliente')
    op.drop_column('precios_especiales_cliente', 'margen_sobre_base')
    op.drop_column('precios_especiales_cliente', 'usar_precio_base')
