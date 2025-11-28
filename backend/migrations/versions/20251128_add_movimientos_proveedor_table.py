from alembic import op
import sqlalchemy as sa

revision = '20251128_add_movimientos_proveedor_table'
down_revision = '20251128_add_audit_logs_table'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'movimientos_proveedor',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('proveedor_id', sa.Integer(), nullable=False),
        sa.Column('orden_id', sa.Integer(), nullable=False),
        sa.Column('tipo', sa.String(length=10), nullable=False),
        sa.Column('monto', sa.Numeric(15, 2), nullable=False),
        sa.Column('fecha', sa.DateTime(), nullable=True),
        sa.Column('descripcion', sa.String(length=255), nullable=True),
        sa.Column('usuario', sa.String(length=100), nullable=True),
    )
    op.create_index('ix_mov_prov_proveedor', 'movimientos_proveedor', ['proveedor_id'])
    op.create_index('ix_mov_prov_orden', 'movimientos_proveedor', ['orden_id'])
    op.create_index('ix_mov_prov_tipo', 'movimientos_proveedor', ['tipo'])
    op.create_foreign_key('fk_mov_prov_proveedor', 'movimientos_proveedor', 'proveedores', ['proveedor_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('fk_mov_prov_orden', 'movimientos_proveedor', 'ordenes_compra', ['orden_id'], ['id'], ondelete='CASCADE')


def downgrade():
    op.drop_constraint('fk_mov_prov_orden', 'movimientos_proveedor', type_='foreignkey')
    op.drop_constraint('fk_mov_prov_proveedor', 'movimientos_proveedor', type_='foreignkey')
    op.drop_index('ix_mov_prov_tipo', table_name='movimientos_proveedor')
    op.drop_index('ix_mov_prov_orden', table_name='movimientos_proveedor')
    op.drop_index('ix_mov_prov_proveedor', table_name='movimientos_proveedor')
    op.drop_table('movimientos_proveedor')

