#!/usr/bin/env python3
"""
Test de query SQL para verificar que Dashboard Pedidos y Admin traigan los mismos valores.
Ejecutar en la shell de Flask o pytest.
"""
import sys
sys.path.insert(0, '/home/dev_taup/proyectos/quimex/backend')

from app import create_app, db
from app.models import Venta, DetalleVenta
from sqlalchemy import func, and_
from datetime import datetime, date, timedelta
from decimal import Decimal
try:
    from zoneinfo import ZoneInfo
    AR_TZ = ZoneInfo("America/Argentina/Buenos_Aires")
except ImportError:
    import pytz
    AR_TZ = pytz.timezone("America/Argentina/Buenos_Aires")


def test_dashboard_consistency():
    """Prueba que ambos dashboards traigan los mismos valores"""
    
    # Crear contexto de aplicación
    app = create_app()
    with app.app_context():
        print("=" * 80)
        print("TEST: Consistencia de Dashboards")
        print("=" * 80)
        
        # Obtener fechas
        now_local = datetime.now(AR_TZ) if AR_TZ else datetime.now()
        today = now_local.date()
        manana = today + timedelta(days=1)
        
        today_start_dt = datetime.combine(today, datetime.min.time())
        today_end_dt = datetime.combine(today, datetime.max.time())
        manana_start_dt = datetime.combine(manana, datetime.min.time())
        manana_end_dt = datetime.combine(manana, datetime.max.time())
        
        print(f"\nFecha analizada: {today}")
        print(f"Zona horaria: {AR_TZ}")
        
        # =====================================================
        # QUERY PARA DASHBOARD PEDIDOS (con los cambios)
        # =====================================================
        print("\n" + "=" * 80)
        print("DASHBOARD PEDIDOS (ventas-pedidos endpoint)")
        print("=" * 80)
        
        # Filtros
        filtro_pedido = (Venta.direccion_entrega.isnot(None)) & (Venta.direccion_entrega != '')
        filtro_puerta = (Venta.direccion_entrega.is_(None)) | (Venta.direccion_entrega == '')
        filtro_no_cancelado = ~Venta.nombre_vendedor.ilike('%CANCELADO%')
        
        # Ingresos puerta hoy
        ingreso_puerta_hoy_ped = db.session.query(
            func.sum(Venta.monto_final_redondeado)
        ).filter(
            filtro_puerta,
            Venta.fecha_pedido.between(today_start_dt, today_end_dt)
        ).scalar() or Decimal('0.0')
        
        # Ingresos pedidos hoy
        ingreso_pedidos_hoy_ped = db.session.query(
            func.sum(Venta.monto_final_redondeado)
        ).filter(
            filtro_pedido,
            filtro_no_cancelado,
            Venta.fecha_pedido.between(today_start_dt, today_end_dt)
        ).scalar() or Decimal('0.0')
        
        # KGs manana
        kgs_manana_ped = db.session.query(
            func.sum(DetalleVenta.cantidad)
        ).join(Venta).filter(
            filtro_pedido,
            Venta.fecha_pedido.between(manana_start_dt, manana_end_dt)
        ).scalar() or Decimal('0.0')
        
        print(f"\nIngreso Puerta (Hoy):  ${float(ingreso_puerta_hoy_ped):>12,.2f}")
        print(f"Ingreso Pedidos (Hoy): ${float(ingreso_pedidos_hoy_ped):>12,.2f}")
        print(f"KGs Mañana:            {float(kgs_manana_ped):>12,.2f} kg")
        
        # =====================================================
        # QUERY PARA DASHBOARD ADMIN (reportes/dashboard-kpis)
        # =====================================================
        print("\n" + "=" * 80)
        print("DASHBOARD ADMIN (reportes/dashboard-kpis)")
        print("=" * 80)
        
        # Filtros del Admin (usa cliente_id en lugar de direccion_entrega)
        filtro_dia_entrega = func.date(Venta.fecha_pedido) == today
        
        # Puerta (sin cliente)
        ingreso_puerta_hoy_admin = db.session.query(
            func.sum(Venta.monto_final_redondeado)
        ).filter(
            filtro_dia_entrega,
            Venta.cliente_id.is_(None)
        ).scalar() or Decimal('0.0')
        
        # Pedidos (con cliente, sin cancelados)
        ventas_pedido = db.session.query(Venta).filter(
            filtro_dia_entrega,
            Venta.cliente_id.isnot(None)
        ).all()
        
        def estado_de_venta(nombre_vendedor):
            if not nombre_vendedor:
                return ''
            partes = nombre_vendedor.split('-', 1)
            estado = partes[0].strip().upper()
            return estado
        
        ventas_pedido_filtradas = [v for v in ventas_pedido if estado_de_venta(v.nombre_vendedor) != 'CANCELADO']
        ingreso_pedidos_hoy_admin = sum(
            Decimal(v.monto_final_redondeado or 0)
            for v in ventas_pedido_filtradas
        )
        
        # KGs manana
        kgs_manana_admin = db.session.query(
            func.sum(DetalleVenta.cantidad)
        ).join(Venta).filter(
            func.date(Venta.fecha_pedido) == manana,
            Venta.cliente_id.isnot(None)
        ).scalar() or Decimal('0.0')
        
        print(f"\nIngreso Puerta (Hoy):  ${float(ingreso_puerta_hoy_admin):>12,.2f}")
        print(f"Ingreso Pedidos (Hoy): ${float(ingreso_pedidos_hoy_admin):>12,.2f}")
        print(f"KGs Mañana:            {float(kgs_manana_admin):>12,.2f} kg")
        
        # =====================================================
        # COMPARACIÓN
        # =====================================================
        print("\n" + "=" * 80)
        print("COMPARACIÓN DE RESULTADOS")
        print("=" * 80)
        
        comparaciones = [
            ("Ingreso Puerta (Hoy)", ingreso_puerta_hoy_ped, ingreso_puerta_hoy_admin),
            ("Ingreso Pedidos (Hoy)", ingreso_pedidos_hoy_ped, ingreso_pedidos_hoy_admin),
            ("KGs Mañana", kgs_manana_ped, kgs_manana_admin),
        ]
        
        print(f"\n{'MÉTRICA':<25} {'PEDIDOS':<20} {'ADMIN':<20} {'DIFERENCIA':<20} {'ESTADO'}")
        print("-" * 90)
        
        todos_iguales = True
        for metrica, valor_ped, valor_admin in comparaciones:
            diferencia = valor_ped - valor_admin
            estado = "✓ IGUAL" if abs(diferencia) < 0.01 else "✗ DIFERENTE"
            
            if abs(diferencia) >= 0.01:
                todos_iguales = False
            
            print(f"{metrica:<25} ${float(valor_ped):>17,.2f} ${float(valor_admin):>17,.2f} ${float(diferencia):>17,.2f} {estado}")
        
        # =====================================================
        # DESGLOSE DETALLADO
        # =====================================================
        print("\n" + "=" * 80)
        print("DESGLOSE POR FORMA DE PAGO - PUERTA")
        print("=" * 80)
        
        puerta_por_pago = db.session.query(
            Venta.forma_pago,
            func.sum(Venta.monto_final_redondeado)
        ).filter(
            filtro_puerta,
            Venta.fecha_pedido.between(today_start_dt, today_end_dt)
        ).group_by(Venta.forma_pago).all()
        
        print("\nForma de Pago         Monto")
        print("-" * 40)
        for forma_pago, monto in puerta_por_pago:
            forma_key = str(forma_pago or 'Desconocido').strip()
            print(f"{forma_key:<20} ${float(monto):>12,.2f}")
        
        # =====================================================
        # RESULTADO FINAL
        # =====================================================
        print("\n" + "=" * 80)
        if todos_iguales:
            print("✓ SUCCESS: Los dashboards ahora coinciden!")
        else:
            print("✗ FAILED: Aún hay diferencias entre los dashboards")
            print("\nVerifica:")
            print("  1. ¿El filtro de cancelados se aplica igual?")
            print("  2. ¿El campo monto_final_redondeado es el mismo?")
            print("  3. ¿Las fechas están en la zona horaria correcta?")
        print("=" * 80)
        
        return todos_iguales


if __name__ == "__main__":
    success = test_dashboard_consistency()
    sys.exit(0 if success else 1)
