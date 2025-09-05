# app/blueprints/dashboard.py

from flask import Blueprint, jsonify
from sqlalchemy import func, case, or_
from decimal import Decimal
import datetime
import traceback

from .. import db
from ..models import Venta, DetalleVenta, OrdenCompra
from ..utils.decorators import token_required

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/dashboard')

@dashboard_bp.route('/kpis', methods=['GET'])
@token_required
def get_dashboard_kpis(current_user):
    """
    Endpoint único y optimizado que calcula y devuelve todos los KPIs para el dashboard,
    basado en los modelos existentes.
    """
    try:
        today = datetime.date.today()
        tomorrow = today + datetime.timedelta(days=1)
        month_start = today.replace(day=1)
        next_month_start = (month_start.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
        month_end = next_month_start - datetime.timedelta(days=1)
        
        today_start_dt = datetime.datetime.combine(today, datetime.time.min)
        today_end_dt = datetime.datetime.combine(today, datetime.time.max)
        tomorrow_start_dt = datetime.datetime.combine(tomorrow, datetime.time.min)
        tomorrow_end_dt = datetime.datetime.combine(tomorrow, datetime.time.max)

        # --- Fila 1: KPIs Rápidos ---
        ingresos_hoy = db.session.query(
            func.sum(case((or_(Venta.direccion_entrega.is_(None), Venta.direccion_entrega == ''), Venta.monto_final_con_recargos), else_=0)).label('puerta'),
            # SOLUCIÓN DEFINITIVA: Sintaxis correcta para la condición compuesta
            func.sum(case(
                ( (Venta.direccion_entrega.isnot(None)) & (Venta.direccion_entrega != ''), Venta.monto_final_con_recargos ), 
                else_=0
            )).label('pedido')
        ).filter(Venta.fecha_pedido.between(today_start_dt, today_end_dt)).first()

        ingreso_pedido_manana = db.session.query(func.sum(Venta.monto_final_con_recargos)).filter(
            Venta.fecha_pedido.between(tomorrow_start_dt, tomorrow_end_dt)
        ).scalar() or Decimal('0.0')

        kgs_manana = Decimal('0.0')

        deuda_proveedores = db.session.query(
            func.sum(func.coalesce(OrdenCompra.importe_total_estimado, 0) - func.coalesce(OrdenCompra.importe_abonado, 0))
        ).filter(
            OrdenCompra.estado.in_(['APROBADO', 'CON DEUDA', 'RECIBIDA_PARCIAL'])
        ).scalar() or Decimal('0.0')

        compras_por_recibir = db.session.query(
            func.sum(OrdenCompra.importe_total_estimado)
        ).filter(
            OrdenCompra.estado == 'EN_ESPERA_RECEPCION'
        ).scalar() or Decimal('0.0')

        # --- Fila 2: KPIs Mensuales ---
        ventas_mes = db.session.query(func.sum(Venta.monto_final_con_recargos)).filter(
            Venta.fecha_pedido.between(month_start, month_end)
        ).scalar() or Decimal('0.0')

        costos_variables_mes = db.session.query(func.sum(DetalleVenta.cantidad * DetalleVenta.costo_unitario_momento_ars)).select_from(DetalleVenta).join(Venta).filter(
            Venta.fecha_pedido.between(month_start, month_end)
        ).scalar() or Decimal('0.0')
        
        costos_fijos_mes = Decimal('0.0')

        # --- Fila 3: Ratios Mensuales ---
        relacion_ingresos = db.session.query(
            func.sum(case((or_(Venta.direccion_entrega.is_(None), Venta.direccion_entrega == ''), Venta.monto_final_con_recargos), else_=0)).label('puerta'),
            # SOLUCIÓN DEFINITIVA: Sintaxis correcta para la condición compuesta
            func.sum(case(
                ( (Venta.direccion_entrega.isnot(None)) & (Venta.direccion_entrega != ''), Venta.monto_final_con_recargos ),
                else_=0
            )).label('pedidos')
        ).filter(Venta.fecha_pedido.between(month_start, month_end)).first()

        relacion_pagos = db.session.query(
            func.sum(case((Venta.forma_pago == 'efectivo', Venta.monto_final_con_recargos), else_=0)).label('efectivo'),
            func.sum(case((Venta.forma_pago.in_(['transferencia', 'factura']), Venta.monto_final_con_recargos), else_=0)).label('otros')
        ).filter(Venta.fecha_pedido.between(month_start, month_end)).first()

        # --- Ensamblar Respuesta ---
        response_data = {
            "primera_fila": {
                "ingreso_puerta_hoy": float(ingresos_hoy.puerta or 0),
                "ingreso_pedido_hoy": float(ingresos_hoy.pedido or 0),
                "ingreso_pedido_manana": float(ingreso_pedido_manana),
                "kgs_manana": float(kgs_manana),
                "deuda_proveedores": float(deuda_proveedores),
                "compras_por_recibir": float(compras_por_recibir)
            },
            "segunda_fila": {
                "ventas_mes": float(ventas_mes),
                "costos_variables_mes": float(costos_variables_mes),
                "costos_fijos_mes": float(costos_fijos_mes)
            },
            "tercera_fila": {
                "relacion_ingresos": {
                    "puerta": float(relacion_ingresos.puerta or 0),
                    "pedidos": float(relacion_ingresos.pedidos or 0)
                },
                "relacion_pagos": {
                    "efectivo": float(relacion_pagos.efectivo or 0),
                    "otros": float(relacion_pagos.otros or 0)
                }
            }
        }
        return jsonify(response_data)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Error interno del servidor: {str(e)}"}), 500