# app/blueprints/dashboard.py

from flask import Blueprint, jsonify
from sqlalchemy import func, case, or_
from decimal import Decimal
import datetime
import traceback

from .. import db
from ..models import Venta, DetalleVenta, OrdenCompra
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/dashboard')

@dashboard_bp.route('/kpis', methods=['GET'])
@token_required
def get_dashboard_kpis(current_user):
    """
    Dashboard simplificado - Solo muestra:
    - Hora actual
    - KGs a entregar (pendientes)
    - Pedidos pendientes de entrega
    - Ingresos de hoy por puerta
    - Ingresos de hoy por pedidos
    """
    try:
        today = datetime.date.today()
        today_start_dt = datetime.datetime.combine(today, datetime.time.min)
        today_end_dt = datetime.datetime.combine(today, datetime.time.max)

        # 1. Hora actual
        hora_actual = datetime.datetime.now().strftime("%H:%M:%S")

        # 2. KGs a entregar (cantidad en detalles de pedidos no entregados)
        # Un pedido está pendiente si tiene dirección_entrega y el nombre_vendedor NO contiene 'ENTREGADO'
        ventas_pendientes = db.session.query(Venta).filter(
            (Venta.direccion_entrega.isnot(None)) & (Venta.direccion_entrega != ''),
            ~Venta.nombre_vendedor.ilike('%ENTREGADO%')  # Excluir los que están entregados
        ).all()

        total_kgs_pendientes = db.session.query(
            func.sum(DetalleVenta.cantidad)
        ).select_from(DetalleVenta).join(Venta).filter(
            (Venta.direccion_entrega.isnot(None)) & (Venta.direccion_entrega != ''),
            ~Venta.nombre_vendedor.ilike('%ENTREGADO%')
        ).scalar() or Decimal('0.0')

        # 3. Pedidos pendientes de entrega (contar ventas)
        cantidad_pedidos_pendientes = len(ventas_pendientes)

        # 4 & 5. Ingresos de hoy por puerta y pedidos
        ingresos_hoy = db.session.query(
            func.sum(case((or_(Venta.direccion_entrega.is_(None), Venta.direccion_entrega == ''), Venta.monto_final_con_recargos), else_=0)).label('puerta'),
            func.sum(case(
                ((Venta.direccion_entrega.isnot(None)) & (Venta.direccion_entrega != ''), Venta.monto_final_con_recargos),
                else_=0
            )).label('pedido')
        ).filter(Venta.fecha_pedido.between(today_start_dt, today_end_dt)).first()

        puerta_hoy = float((getattr(ingresos_hoy, 'puerta', 0) or 0))
        pedido_hoy = float((getattr(ingresos_hoy, 'pedido', 0) or 0))

        response_data = {
            "hora_actual": hora_actual,
            "kgs_pendientes": float(total_kgs_pendientes),
            "pedidos_pendientes": cantidad_pedidos_pendientes,
            "ingreso_puerta_hoy": puerta_hoy,
            "ingreso_pedido_hoy": pedido_hoy
        }
        return jsonify(response_data)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Error interno del servidor: {str(e)}"}), 500


@dashboard_bp.route('/ventas-pedidos', methods=['GET'])
@token_required
@roles_required(ROLES['VENTAS_PEDIDOS'])
def get_dashboard_ventas_pedidos(current_user):
    """
    Dashboard simplificado solo para vendedores de pedidos (VENTAS_PEDIDOS).
    Muestra KPIs enfocados en pedidos solamente.
    """
    try:
        today = datetime.date.today()
        month_start = today.replace(day=1)
        next_month_start = (month_start.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
        month_end = next_month_start - datetime.timedelta(days=1)
        
        today_start_dt = datetime.datetime.combine(today, datetime.time.min)
        today_end_dt = datetime.datetime.combine(today, datetime.time.max)

        # Filtro: Solo pedidos (con dirección de entrega)
        filtro_pedido = (Venta.direccion_entrega.isnot(None)) & (Venta.direccion_entrega != '')

        # KPIs de hoy - Pedidos
        ingresos_pedido_hoy = db.session.query(
            func.sum(Venta.monto_final_con_recargos)
        ).filter(
            filtro_pedido,
            Venta.fecha_pedido.between(today_start_dt, today_end_dt)
        ).scalar() or Decimal('0.0')

        cantidad_ventas_hoy = db.session.query(
            func.count(Venta.id)
        ).filter(
            filtro_pedido,
            Venta.fecha_pedido.between(today_start_dt, today_end_dt)
        ).scalar() or 0

        # KPIs del mes - Pedidos
        ingresos_pedido_mes = db.session.query(
            func.sum(Venta.monto_final_con_recargos)
        ).filter(
            filtro_pedido,
            Venta.fecha_pedido.between(month_start, month_end)
        ).scalar() or Decimal('0.0')

        cantidad_ventas_mes = db.session.query(
            func.count(Venta.id)
        ).filter(
            filtro_pedido,
            Venta.fecha_pedido.between(month_start, month_end)
        ).scalar() or 0

        # Costo de pedidos del mes
        costos_mes = db.session.query(
            func.sum(DetalleVenta.cantidad * DetalleVenta.costo_unitario_momento_ars)
        ).select_from(DetalleVenta).join(Venta).filter(
            filtro_pedido,
            Venta.fecha_pedido.between(month_start, month_end)
        ).scalar() or Decimal('0.0')

        # Relación de pagos (efectivo vs otros)
        relacion_pagos = db.session.query(
            func.sum(case((Venta.forma_pago == 'efectivo', Venta.monto_final_con_recargos), else_=0)).label('efectivo'),
            func.sum(case((Venta.forma_pago.in_(['transferencia', 'factura']), Venta.monto_final_con_recargos), else_=0)).label('otros')
        ).filter(
            filtro_pedido,
            Venta.fecha_pedido.between(month_start, month_end)
        ).first()

        # Margen de ganancia mensual
        margen_mes = ingresos_pedido_mes - costos_mes if ingresos_pedido_mes > 0 else Decimal('0.0')
        porcentaje_margen = (margen_mes / ingresos_pedido_mes * 100) if ingresos_pedido_mes > 0 else 0

        response_data = {
            "hoy": {
                "ingresos_pedido": float(ingresos_pedido_hoy),
                "cantidad_ventas": cantidad_ventas_hoy,
                "promedio_venta": float(ingresos_pedido_hoy / cantidad_ventas_hoy) if cantidad_ventas_hoy > 0 else 0
            },
            "mes": {
                "ingresos_pedido": float(ingresos_pedido_mes),
                "cantidad_ventas": cantidad_ventas_mes,
                "promedio_venta": float(ingresos_pedido_mes / cantidad_ventas_mes) if cantidad_ventas_mes > 0 else 0,
                "costos": float(costos_mes),
                "margen": float(margen_mes),
                "porcentaje_margen": float(porcentaje_margen)
            },
            "pagos_mes": {
                "efectivo": float((getattr(relacion_pagos, 'efectivo', 0) or 0)),
                "otros": float((getattr(relacion_pagos, 'otros', 0) or 0))
            }
        }
        
        return jsonify(response_data)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Error interno del servidor: {str(e)}"}), 500
