"""Recalcular deuda de proveedores segun cantidad recepcionada.

Revision ID: 20260323_recalcular_deuda_por_recepcion
Revises: 20260318_add_iva_to_ordencompra
Create Date: 2026-03-23
"""

from alembic import op
import sqlalchemy as sa

revision = '20260323_recalcular_deuda_por_recepcion'
down_revision = '20260318_add_iva_to_ordencompra'
branch_labels = None
depends_on = None


def upgrade():
    # Recalcular DEBITOs existentes: deuda = max(recepcionado - abonado, 0), convertido a ARS si aplica.
    op.execute(sa.text("""
        UPDATE movimientos_proveedor mp
        JOIN ordenes_compra oc ON oc.id = mp.orden_id
        LEFT JOIN (
            SELECT
                d.orden_id,
                SUM(COALESCE(d.cantidad_recibida, 0) * COALESCE(d.precio_unitario_estimado, 0)) AS recepcionado
            FROM detalles_orden_compra d
            GROUP BY d.orden_id
        ) rec ON rec.orden_id = oc.id
        SET
            mp.monto = ROUND(
                GREATEST(
                    (
                        COALESCE(rec.recepcionado, 0) - COALESCE(oc.importe_abonado, 0)
                    ) * (
                        CASE
                            WHEN oc.ajuste_tc = 1 THEN COALESCE((
                                SELECT tc.valor
                                FROM tipos_cambio tc
                                WHERE tc.nombre = 'Oficial'
                                ORDER BY tc.id DESC
                                LIMIT 1
                            ), 1)
                            ELSE 1
                        END
                    ),
                    0
                ),
                2
            ),
            mp.descripcion = CONCAT('OC ', oc.id, ' - Deuda por recepcion efectiva (migracion 20260323)'),
            mp.usuario = COALESCE(mp.usuario, 'migracion')
        WHERE mp.tipo = 'DEBITO'
    """))

    # Crear DEBITOs faltantes para ordenes con recepcion efectiva y saldo pendiente.
    op.execute(sa.text("""
        INSERT INTO movimientos_proveedor (
            proveedor_id,
            orden_id,
            tipo,
            monto,
            fecha,
            descripcion,
            usuario
        )
        SELECT
            oc.proveedor_id,
            oc.id,
            'DEBITO',
            ROUND(
                GREATEST(
                    (
                        COALESCE(rec.recepcionado, 0) - COALESCE(oc.importe_abonado, 0)
                    ) * (
                        CASE
                            WHEN oc.ajuste_tc = 1 THEN COALESCE((
                                SELECT tc.valor
                                FROM tipos_cambio tc
                                WHERE tc.nombre = 'Oficial'
                                ORDER BY tc.id DESC
                                LIMIT 1
                            ), 1)
                            ELSE 1
                        END
                    ),
                    0
                ),
                2
            ) AS monto_deuda,
            NOW(),
            CONCAT('OC ', oc.id, ' - Deuda por recepcion efectiva (migracion 20260323)'),
            'migracion'
        FROM ordenes_compra oc
        LEFT JOIN (
            SELECT
                d.orden_id,
                SUM(COALESCE(d.cantidad_recibida, 0) * COALESCE(d.precio_unitario_estimado, 0)) AS recepcionado
            FROM detalles_orden_compra d
            GROUP BY d.orden_id
        ) rec ON rec.orden_id = oc.id
        LEFT JOIN movimientos_proveedor mp
            ON mp.orden_id = oc.id AND mp.tipo = 'DEBITO'
        WHERE mp.id IS NULL
          AND GREATEST(
                (
                    COALESCE(rec.recepcionado, 0) - COALESCE(oc.importe_abonado, 0)
                ) * (
                    CASE
                        WHEN oc.ajuste_tc = 1 THEN COALESCE((
                            SELECT tc.valor
                            FROM tipos_cambio tc
                            WHERE tc.nombre = 'Oficial'
                            ORDER BY tc.id DESC
                            LIMIT 1
                        ), 1)
                        ELSE 1
                    END
                ),
                0
          ) > 0
    """))

    # Ordenes sin recepcion no deben figurar en estado CON DEUDA por regla nueva.
    op.execute(sa.text("""
        UPDATE ordenes_compra oc
        LEFT JOIN (
            SELECT
                d.orden_id,
                SUM(COALESCE(d.cantidad_recibida, 0) * COALESCE(d.precio_unitario_estimado, 0)) AS recepcionado
            FROM detalles_orden_compra d
            GROUP BY d.orden_id
        ) rec ON rec.orden_id = oc.id
        SET oc.estado = 'APROBADO'
        WHERE COALESCE(rec.recepcionado, 0) <= 0
          AND UPPER(COALESCE(oc.estado, '')) IN ('CON DEUDA', 'RECIBIDA_PARCIAL')
    """))


def downgrade():
    # No reversible automaticamente: la regla anterior dependia de deuda por total solicitado.
    pass
