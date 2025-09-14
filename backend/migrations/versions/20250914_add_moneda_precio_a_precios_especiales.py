"""Add moneda_original, precio_original, tipo_cambio_usado to precios_especiales_cliente

Revision ID: 20250914_add_moneda_precio
Revises: 
Create Date: 2025-09-14 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250914_add_moneda_precio'
down_revision = '9b4fdb62a315'
branch_labels = None
depends_on = None


def upgrade():
    # Añadir columnas a la tabla precios_especiales_cliente
    op.add_column('precios_especiales_cliente', sa.Column('moneda_original', sa.String(length=3), nullable=True))
    op.add_column('precios_especiales_cliente', sa.Column('precio_original', sa.Numeric(15, 4), nullable=True))
    op.add_column('precios_especiales_cliente', sa.Column('tipo_cambio_usado', sa.Numeric(15, 6), nullable=True))
    # índice para moneda_original
    op.create_index('ix_precios_moneda_original', 'precios_especiales_cliente', ['moneda_original'])


def downgrade():
    op.drop_index('ix_precios_moneda_original', table_name='precios_especiales_cliente')
    op.drop_column('precios_especiales_cliente', 'tipo_cambio_usado')
    op.drop_column('precios_especiales_cliente', 'precio_original')
    op.drop_column('precios_especiales_cliente', 'moneda_original')
