"""Agregar columnas de descuento

Revision ID: 770c9ed9aa76
Revises: f9a57907d9be
Create Date: 2025-08-28 15:10:44.659316
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '770c9ed9aa76'
down_revision = 'f9a57907d9be'
branch_labels = None
depends_on = None


def upgrade():
    # Agregar columna descuento_item en detalles_venta
    op.add_column('detalles_venta', sa.Column('descuento_item', sa.Numeric(5, 2), nullable=True, server_default='0.00'))

    # Agregar columna descuento_general en ventas
    op.add_column('ventas', sa.Column('descuento_general', sa.Numeric(5, 2), nullable=True, server_default='0.00'))

    # Nota: No tocamos índices ni foreign keys para evitar errores en MySQL


def downgrade():
    # Eliminar columnas de descuento
    op.drop_column('ventas', 'descuento_general')
    op.drop_column('detalles_venta', 'descuento_item')
