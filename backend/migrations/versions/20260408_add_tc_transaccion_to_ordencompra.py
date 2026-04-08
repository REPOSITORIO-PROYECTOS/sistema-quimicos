"""Add tc_transaccion to ordenes_compra.

Revision ID: 20260408_add_tc_transaccion_to_ordencompra
Revises: 20260326_recalcular_deuda_por_total_objetivo_oc
Create Date: 2026-04-08
"""

from alembic import op
import sqlalchemy as sa


revision = '20260408_add_tc_transaccion_to_ordencompra'
down_revision = '20260326_recalcular_deuda_por_total_objetivo_oc'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'ordenes_compra',
        sa.Column('tc_transaccion', sa.Numeric(10, 2), nullable=True)
    )

    # Inicializa con identidad ARS y aplica fallback para OCs USD sin snapshot.
    op.execute(sa.text("""
        UPDATE ordenes_compra
        SET tc_transaccion = 1.00
        WHERE tc_transaccion IS NULL
    """))

    op.execute(sa.text("""
        UPDATE ordenes_compra oc
        LEFT JOIN (
            SELECT valor
            FROM tipos_cambio
            WHERE nombre = 'Oficial'
            ORDER BY id DESC
            LIMIT 1
        ) tc ON 1=1
        SET oc.tc_transaccion = COALESCE(tc.valor, 1.00)
        WHERE oc.ajuste_tc = 1
          AND (
              oc.observaciones_solicitud IS NULL
              OR oc.observaciones_solicitud NOT LIKE '%__TC_SNAPSHOT__:%'
          )
    """))

    # Intento de parseo directo de snapshot para mover tc_usado a columna tipada.
    op.execute(sa.text("""
        UPDATE ordenes_compra
        SET tc_transaccion = CAST(
            REPLACE(
                SUBSTRING_INDEX(
                    SUBSTRING_INDEX(observaciones_solicitud, '"tc_usado":', -1),
                    ',',
                    1
                ),
                '}',
                ''
            ) AS DECIMAL(10,2)
        )
        WHERE ajuste_tc = 1
          AND observaciones_solicitud LIKE '%__TC_SNAPSHOT__:%"tc_usado":%'
    """))

    op.alter_column('ordenes_compra', 'tc_transaccion', nullable=False, existing_type=sa.Numeric(10, 2))


def downgrade():
    op.drop_column('ordenes_compra', 'tc_transaccion')
