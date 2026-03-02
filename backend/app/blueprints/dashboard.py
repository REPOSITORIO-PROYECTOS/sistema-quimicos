# app/blueprints/dashboard.py

from flask import Blueprint, jsonify, request
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
@roles_required(['ADMIN'])
def get_dashboard_kpis(current_user):
    """
    Dashboard COMPLETO para Admin - Con filtros para ver histórico.
    Parámetros de query:
    - fecha_inicio (YYYY-MM-DD): opcional
    - fecha_fin (YYYY-MM-DD): opcional
    - tipo_venta: 'puerta', 'pedido' o vacío para ambas
    
    Muestra costos, ingresos, márgenes y datos completos para análisis.
    """
    try:
        # Parámetros de filtro
        fecha_inicio_str = request.args.get('fecha_inicio')
        fecha_fin_str = request.args.get('fecha_fin')
        tipo_venta = request.args.get('tipo_venta', '')  # '', 'puerta', 'pedido'
        
        # Fechas por defecto (hoy)
        today = datetime.date.today()
        if fecha_inicio_str:
            fecha_inicio = datetime.datetime.strptime(fecha_inicio_str, '%Y-%m-%d').date()
        else:
            fecha_inicio = today
        
        if fecha_fin_str:
            fecha_fin = datetime.datetime.strptime(fecha_fin_str, '%Y-%m-%d').date()
        else:
            fecha_fin = today
        
        fecha_inicio_dt = datetime.datetime.combine(fecha_inicio, datetime.time.min)
        fecha_fin_dt = datetime.datetime.combine(fecha_fin, datetime.time.max)
        
        # Construcción de filtros
        filtro_base = Venta.fecha_pedido.between(fecha_inicio_dt, fecha_fin_dt)
        
        if tipo_venta == 'puerta':
            filtro_venta = or_(Venta.direccion_entrega.is_(None), Venta.direccion_entrega == '')
        elif tipo_venta == 'pedido':
            filtro_venta = (Venta.direccion_entrega.isnot(None)) & (Venta.direccion_entrega != '')
        else:
            filtro_venta = True
        
        # INGRESOS totales
        ingresos_total = db.session.query(
            func.sum(Venta.monto_final_con_recargos)
        ).filter(filtro_base, filtro_venta).scalar() or Decimal('0.0')
        
        # COSTOS totales
        costos_total = db.session.query(
            func.sum(DetalleVenta.cantidad * DetalleVenta.costo_unitario_momento_ars)
        ).select_from(DetalleVenta).join(Venta).filter(filtro_base, filtro_venta).scalar() or Decimal('0.0')
        
        # MARGEN
        margen_total = ingresos_total - costos_total
        porcentaje_margen = (margen_total / ingresos_total * 100) if ingresos_total > 0 else 0
        
        # CANTIDAD de ventas
        cantidad_ventas = db.session.query(
            func.count(Venta.id)
        ).filter(filtro_base, filtro_venta).scalar() or 0
        
        # PROMEDIO por venta
        promedio_venta = float(ingresos_total / cantidad_ventas) if cantidad_ventas > 0 else 0
        
        # DESGLOSE por tipo de venta
        desglose = db.session.query(
            func.sum(case((or_(Venta.direccion_entrega.is_(None), Venta.direccion_entrega == ''), Venta.monto_final_con_recargos), else_=0)).label('puerta'),
            func.sum(case(
                ((Venta.direccion_entrega.isnot(None)) & (Venta.direccion_entrega != ''), Venta.monto_final_con_recargos),
                else_=0
            )).label('pedido'),
            func.count(case(((Venta.direccion_entrega.isnot(None)) & (Venta.direccion_entrega != ''), 1))).label('count_pedidos'),
            func.count(case((or_(Venta.direccion_entrega.is_(None), Venta.direccion_entrega == ''), 1))).label('count_puerta')
        ).filter(filtro_base).first()
        
        # PAGOS por forma
        pagos = db.session.query(
            func.sum(case((Venta.forma_pago == 'efectivo', Venta.monto_final_con_recargos), else_=0)).label('efectivo'),
            func.sum(case((Venta.forma_pago == 'transferencia', Venta.monto_final_con_recargos), else_=0)).label('transferencia'),
            func.sum(case((Venta.forma_pago == 'factura', Venta.monto_final_con_recargos), else_=0)).label('factura')
        ).filter(filtro_base, filtro_venta).first()
        
        # DATOS DE PENDIENTES (independiente de filtros de fecha)
        # Filtro para pendientes: pedidos sin entregar
        filtro_pendiente = (Venta.direccion_entrega.isnot(None)) & (Venta.direccion_entrega != '') & ~Venta.nombre_vendedor.ilike('%ENTREGADO%')
        
        # KGs pendientes de entrega
        total_kgs_pendientes = db.session.query(
            func.sum(DetalleVenta.cantidad)
        ).select_from(DetalleVenta).join(Venta).filter(filtro_pendiente).scalar() or Decimal('0.0')
        
        # Cantidad de pedidos pendientes de entrega
        cantidad_pedidos_pendientes = db.session.query(
            func.count(Venta.id)
        ).filter(filtro_pendiente).scalar() or 0
        
        # COSTOS en el período para cada tipo de venta
        if tipo_venta == 'puerta':
            costos_puerta = costos_total
            costos_pedido = Decimal('0.0')
        elif tipo_venta == 'pedido':
            costos_puerta = Decimal('0.0')
            costos_pedido = costos_total
        else:
            costos_puerta = db.session.query(
                func.sum(DetalleVenta.cantidad * DetalleVenta.costo_unitario_momento_ars)
            ).select_from(DetalleVenta).join(Venta).filter(
                filtro_base,
                or_(Venta.direccion_entrega.is_(None), Venta.direccion_entrega == '')
            ).scalar() or Decimal('0.0')
            
            costos_pedido = db.session.query(
                func.sum(DetalleVenta.cantidad * DetalleVenta.costo_unitario_momento_ars)
            ).select_from(DetalleVenta).join(Venta).filter(
                filtro_base,
                (Venta.direccion_entrega.isnot(None)) & (Venta.direccion_entrega != '')
            ).scalar() or Decimal('0.0')
        
        response_data = {
            "filtros": {
                "fecha_inicio": fecha_inicio_str or today.isoformat(),
                "fecha_fin": fecha_fin_str or today.isoformat(),
                "tipo_venta": tipo_venta if tipo_venta else "ambas"
            },
            "resumen_general": {
                "ingresos_total": float(ingresos_total),
                "costos_total": float(costos_total),
                "margen_total": float(margen_total),
                "porcentaje_margen": float(porcentaje_margen),
                "cantidad_ventas": cantidad_ventas,
                "promedio_venta": promedio_venta
            },
            "desglose_tipo_venta": {
                "puerta": {
                    "ingresos": float((getattr(desglose, 'puerta', 0) or 0)),
                    "cantidad": getattr(desglose, 'count_puerta', 0) or 0,
                    "costos": float(costos_puerta)
                },
                "pedido": {
                    "ingresos": float((getattr(desglose, 'pedido', 0) or 0)),
                    "cantidad": getattr(desglose, 'count_pedidos', 0) or 0,
                    "costos": float(costos_pedido)
                }
            },
            "pagos": {
                "efectivo": float((getattr(pagos, 'efectivo', 0) or 0)),
                "transferencia": float((getattr(pagos, 'transferencia', 0) or 0)),
                "factura": float((getattr(pagos, 'factura', 0) or 0))
            },
            "pendiente_entrega": {
                "cantidad_pedidos": cantidad_pedidos_pendientes,
                "cantidad_kilos": float(total_kgs_pendientes)
            }
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
    Dashboard SIMPLIFICADO para vendedores de pedidos (VENTAS_PEDIDOS).
    Muestra SOLO datos del día de hoy:
    - Ingresos del día (pedidos solamente)
    - Cantidad de pedidos del día
    - Cantidad de kilos del día
    - Cantidad de pedidos pendientes de entrega
    - Cantidad de kilos pendientes de entrega
    """
    try:
        today = datetime.date.today()
        today_start_dt = datetime.datetime.combine(today, datetime.time.min)
        today_end_dt = datetime.datetime.combine(today, datetime.time.max)

        # Filtro: Solo pedidos (con dirección de entrega)
        filtro_pedido = (Venta.direccion_entrega.isnot(None)) & (Venta.direccion_entrega != '')
        filtro_pendiente = filtro_pedido & ~Venta.nombre_vendedor.ilike('%ENTREGADO%')

        # 1. Ingresos del día - Pedidos
        ingresos_pedido_hoy = db.session.query(
            func.sum(Venta.monto_final_con_recargos)
        ).filter(
            filtro_pedido,
            Venta.fecha_pedido.between(today_start_dt, today_end_dt)
        ).scalar() or Decimal('0.0')

        # 2. Cantidad de pedidos del día
        cantidad_pedidos_hoy = db.session.query(
            func.count(Venta.id)
        ).filter(
            filtro_pedido,
            Venta.fecha_pedido.between(today_start_dt, today_end_dt)
        ).scalar() or 0

        # 3. Cantidad de kilos del día
        kgs_hoy = db.session.query(
            func.sum(DetalleVenta.cantidad)
        ).select_from(DetalleVenta).join(Venta).filter(
            filtro_pedido,
            Venta.fecha_pedido.between(today_start_dt, today_end_dt)
        ).scalar() or Decimal('0.0')

        # 4. Cantidad de pedidos pendientes de entrega (no entregados)
        cantidad_pendientes = db.session.query(
            func.count(Venta.id)
        ).filter(filtro_pendiente).scalar() or 0

        # 5. Cantidad de kilos pendientes de entrega
        kgs_pendientes = db.session.query(
            func.sum(DetalleVenta.cantidad)
        ).select_from(DetalleVenta).join(Venta).filter(filtro_pendiente).scalar() or Decimal('0.0')

        response_data = {
            "hoy": {
                "ingresos": float(ingresos_pedido_hoy),
                "cantidad_pedidos": cantidad_pedidos_hoy,
                "cantidad_kilos": float(kgs_hoy)
            },
            "pendiente_entrega": {
                "cantidad_pedidos": cantidad_pendientes,
                "cantidad_kilos": float(kgs_pendientes)
            }
        }
        
        return jsonify(response_data)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Error interno del servidor: {str(e)}"}), 500
