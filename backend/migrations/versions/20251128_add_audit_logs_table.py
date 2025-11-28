from alembic import op
import sqlalchemy as sa

revision = '20251128_add_audit_logs_table'
down_revision = '20251126_add_unidad_medida_detalle_oc'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('entidad', sa.String(length=100), nullable=False),
        sa.Column('entidad_id', sa.Integer(), nullable=False),
        sa.Column('accion', sa.String(length=100), nullable=False),
        sa.Column('usuario', sa.String(length=100), nullable=True),
        sa.Column('fecha', sa.DateTime(), nullable=True),
        sa.Column('datos_previos', sa.Text(), nullable=True),
        sa.Column('datos_nuevos', sa.Text(), nullable=True),
    )
    op.create_index('ix_audit_logs_entidad', 'audit_logs', ['entidad'])
    op.create_index('ix_audit_logs_accion', 'audit_logs', ['accion'])
    op.create_index('ix_audit_logs_entidad_id', 'audit_logs', ['entidad_id'])


def downgrade():
    op.drop_index('ix_audit_logs_entidad_id', table_name='audit_logs')
    op.drop_index('ix_audit_logs_accion', table_name='audit_logs')
    op.drop_index('ix_audit_logs_entidad', table_name='audit_logs')
    op.drop_table('audit_logs')

