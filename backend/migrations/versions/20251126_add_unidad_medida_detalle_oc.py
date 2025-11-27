from alembic import op
import sqlalchemy as sa

revision = '20251126_add_unidad_medida_detalle_oc'
down_revision = '20251005_categorias'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('detalles_orden_compra', sa.Column('unidad_medida', sa.String(length=20), nullable=True))

    connection = op.get_bind()
    from sqlalchemy import text
    connection.execute(text("""
        UPDATE detalles_orden_compra
        SET unidad_medida = 'Litros'
        WHERE producto_id IN (SELECT id FROM productos WHERE unidad_venta = 'LT')
    """))
    connection.execute(text("""
        UPDATE detalles_orden_compra
        SET unidad_medida = 'Kilos'
        WHERE producto_id IN (SELECT id FROM productos WHERE unidad_venta = 'KG')
    """))
    connection.execute(text("""
        UPDATE detalles_orden_compra
        SET unidad_medida = 'Unidades'
        WHERE unidad_medida IS NULL
    """))


def downgrade():
    op.drop_column('detalles_orden_compra', 'unidad_medida')

