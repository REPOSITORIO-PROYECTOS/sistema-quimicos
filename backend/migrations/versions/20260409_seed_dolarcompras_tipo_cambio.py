"""Seed DolarCompras in tipos_cambio.

Revision ID: 20260409_seed_dolarcompras_tipo_cambio
Revises: 20260408_add_tc_transaccion_to_ordencompra
Create Date: 2026-04-09
"""

from alembic import op
import sqlalchemy as sa


revision = '20260409_seed_dolarcompras_tipo_cambio'
down_revision = '20260408_add_tc_transaccion_to_ordencompra'
branch_labels = None
depends_on = None


def upgrade():
    # Alta idempotente de DolarCompras tomando como base TC Oficial cuando exista.
    op.execute(sa.text("""
        INSERT INTO tipos_cambio (nombre, valor, fecha_actualizacion)
        SELECT 'DolarCompras',
               COALESCE(
                   (SELECT tc.valor
                    FROM tipos_cambio tc
                    WHERE tc.nombre = 'Oficial'
                    ORDER BY tc.id DESC
                    LIMIT 1),
                   1.00
               ),
               NOW()
        FROM dual
        WHERE NOT EXISTS (
            SELECT 1
            FROM tipos_cambio
            WHERE nombre = 'DolarCompras'
        )
    """))


def downgrade():
    # Solo elimina el registro de seed para revertir este cambio de datos.
    op.execute(sa.text("""
        DELETE FROM tipos_cambio
        WHERE nombre = 'DolarCompras'
    """))
