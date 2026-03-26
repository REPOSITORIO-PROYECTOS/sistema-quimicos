"""Recalcular deuda y estado de OC por total objetivo.

Revision ID: 20260326_recalcular_deuda_por_total_objetivo_oc
Revises: 20260323_recalcular_deuda_por_recepcion
Create Date: 2026-03-26
"""

from alembic import op
import sqlalchemy as sa


revision = '20260326_recalcular_deuda_por_total_objetivo_oc'
down_revision = '20260323_recalcular_deuda_por_recepcion'
branch_labels = None
depends_on = None


def upgrade():
    # Recalcular DEBITOs con la nueva regla:
    # deuda = max(total_objetivo_oc - abonado, 0), convertido a ARS si ajuste_tc.
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
                        CASE
                            WHEN COALESCE(oc.importe_total_estimado, 0) > 0 THEN COALESCE(oc.importe_total_estimado, 0)
                            ELSE COALESCE(rec.recepcionado, 0)
                        END
                        - COALESCE(oc.importe_abonado, 0)
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
            mp.descripcion = CONCAT('OC ', oc.id, ' - Deuda por total objetivo OC (migracion 20260326)'),
            mp.usuario = COALESCE(mp.usuario, 'migracion')
        WHERE mp.tipo = 'DEBITO'
    """))

    # Crear DEBITOs faltantes para ordenes con saldo pendiente segun total objetivo.
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
                        CASE
                            WHEN COALESCE(oc.importe_total_estimado, 0) > 0 THEN COALESCE(oc.importe_total_estimado, 0)
                            ELSE COALESCE(rec.recepcionado, 0)
                        END
                        - COALESCE(oc.importe_abonado, 0)
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
            CONCAT('OC ', oc.id, ' - Deuda por total objetivo OC (migracion 20260326)'),
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
                    CASE
                        WHEN COALESCE(oc.importe_total_estimado, 0) > 0 THEN COALESCE(oc.importe_total_estimado, 0)
                        ELSE COALESCE(rec.recepcionado, 0)
                    END
                    - COALESCE(oc.importe_abonado, 0)
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

    # Alinear estado de OC con la regla vigente de post-pago.
    # Si recepcion completa: RECIBIDO/RECIBIDA_PARCIAL segun abonado vs objetivo.
    # Si no, y hay saldo pendiente: CON DEUDA. Caso contrario: APROBADO.
    op.execute(sa.text("""
        UPDATE ordenes_compra oc
        LEFT JOIN (
            SELECT
                d.orden_id,
                SUM(COALESCE(d.cantidad_recibida, 0) * COALESCE(d.precio_unitario_estimado, 0)) AS recepcionado
            FROM detalles_orden_compra d
            GROUP BY d.orden_id
        ) rec ON rec.orden_id = oc.id
        SET oc.estado = CASE
            WHEN UPPER(COALESCE(oc.estado, '')) IN ('SOLICITADO', 'RECHAZADO') THEN oc.estado
            WHEN UPPER(COALESCE(oc.estado_recepcion, '')) = 'COMPLETA' THEN
                CASE
                    WHEN COALESCE(oc.importe_abonado, 0) >=
                         CASE
                             WHEN COALESCE(oc.importe_total_estimado, 0) > 0 THEN COALESCE(oc.importe_total_estimado, 0)
                             ELSE COALESCE(rec.recepcionado, 0)
                         END
                    THEN 'RECIBIDO'
                    ELSE 'RECIBIDA_PARCIAL'
                END
            WHEN CASE
                    WHEN COALESCE(oc.importe_total_estimado, 0) > 0 THEN COALESCE(oc.importe_total_estimado, 0)
                    ELSE COALESCE(rec.recepcionado, 0)
                 END > 0
                 AND COALESCE(oc.importe_abonado, 0) <
                     CASE
                         WHEN COALESCE(oc.importe_total_estimado, 0) > 0 THEN COALESCE(oc.importe_total_estimado, 0)
                         ELSE COALESCE(rec.recepcionado, 0)
                     END
            THEN 'CON DEUDA'
            ELSE 'APROBADO'
        END
    """))


def downgrade():
    # No reversible automaticamente: esta migracion consolida datos historicos.
    pass
