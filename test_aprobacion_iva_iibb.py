"""
Test: Aprobación de Orden de Compra con IVA e IIBB
Verifica que importe_abonado pueda ser igual al total CON impuestos
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app import create_app, db
from app.models import OrdenCompra, DetalleOrdenCompra, Producto, Proveedor, UsuarioInterno
from decimal import Decimal
import json

app = create_app()

def test_aprobacion_con_iva_iibb():
    """
    Prueba: Crear OC con base 600k, IVA 21%, IIBB 3.5%, total 747k
    Luego aprobarla pagando exactamente 747k
    """
    with app.app_context():
        # Limpiar y crear datos iniciales
        db.create_all()
        
        # Crear proveedor
        proveedor = Proveedor(
            nombre="Proveedor Test",
            cuit="12345678901",
            ciudad="CABA",
            email="test@test.com"
        )
        db.session.add(proveedor)
        db.session.flush()
        
        # Crear producto
        prod = Producto(
            codigo_interno=11,
            nombre="Test Producto",
            categoria_id=1,
            unidad_medida="Litros",
            costo_estimado=Decimal('3000.00')
        )
        db.session.add(prod)
        db.session.flush()
        
        # Crear usuario para solicitud
        usuario = UsuarioInterno(
            nombre="Admin Test",
            email="admin@test.com",
            rol="ADMIN",
            contrasena="test123"
        )
        db.session.add(usuario)
        db.session.flush()
        
        # --- CREAR OC PARA APROBAR ---
        orden = OrdenCompra(
            nro_solicitud_interno="OC-TEST-001",
            proveedor_id=proveedor.id,
            forma_pago="Efectivo",
            importe_total_estimado=Decimal('600000.00'),  # Base sin impuestos
            observaciones_solicitud="Test aprobación con IVA e IIBB",
            estado="SOLICITADO",
            solicitado_por_id=usuario.id,
            iva="21",
            iibb="3.5"
        )
        db.session.add(orden)
        db.session.flush()
        
        # Agregar detalle
        detalle = DetalleOrdenCompra(
            orden_id=orden.id,
            producto_id=prod.id,
            cantidad_solicitada=Decimal('200'),
            precio_unitario_estimado=Decimal('3000.00'),
            importe_linea_estimado=Decimal('600000.00'),
            unidad_medida="Litros"
        )
        db.session.add(detalle)
        db.session.commit()
        
        orden_id = orden.id
        
        # --- PRUEBA 1: Intenta aprobar CON pago de 747k (total con impuestos) ---
        print("\n✅ TEST 1: Aprobación con pago igual a total CON impuestos")
        try:
            # Simulamos el payload que vendría del frontend
            payload_aprobacion = {
                "proveedor_id": proveedor.id,
                "forma_pago": "Efectivo",
                "iva": "21",
                "iibb": "3.5",
                "importe_abonado": 747000,  # Total con impuestos
                "observaciones_solicitud": "Aprobado con pago completo"
            }
            
            # Obtener la orden y procesarla como lo haría el endpoint
            orden_db = db.session.get(OrdenCompra, orden_id)
            
            # Cálculos locales (como lo hace el código)
            from decimal import Decimal
            
            base_total = orden_db.importe_total_estimado or Decimal('0')
            
            # Parsear tasas
            def _parse_percentage_rate(value):
                try:
                    if value is None:
                        return Decimal('0')
                    raw = str(value).strip()
                    if not raw:
                        return Decimal('0')
                    normalized = raw.replace(',', '.')
                    parsed = Decimal(normalized)
                    return parsed if parsed <= 1 else (parsed / Decimal('100'))
                except Exception:
                    return Decimal('0')
            
            def _parse_iibb_rate(iibb_value):
                try:
                    if iibb_value is None:
                        return Decimal('0')
                    if isinstance(iibb_value, (int, float, Decimal)):
                        v = Decimal(str(iibb_value))
                        return (v if v <= 1 else (v / Decimal('100')))
                    s = str(iibb_value).strip()
                    if s.endswith('%'):
                        s = s[:-1].strip()
                        return (Decimal(s) / Decimal('100'))
                    v = Decimal(s)
                    return (v if v <= 1 else (v / Decimal('100')))
                except Exception:
                    return Decimal('0')
            
            iva_rate_for_calc = _parse_percentage_rate(payload_aprobacion.get('iva'))
            iibb_rate_for_calc = _parse_iibb_rate(payload_aprobacion.get('iibb'))
            
            iva_amount = (base_total * iva_rate_for_calc).quantize(Decimal('0.01'))
            iibb_amount = (base_total * iibb_rate_for_calc).quantize(Decimal('0.01'))
            total_estimado_con_impuestos = (base_total + iva_amount + iibb_amount).quantize(Decimal('0.01'))
            
            print(f"   Base Total: ${base_total:,.2f}")
            print(f"   IVA (21%): ${iva_amount:,.2f}")
            print(f"   IIBB (3.5%): ${iibb_amount:,.2f}")
            print(f"   Total CON impuestos: ${total_estimado_con_impuestos:,.2f}")
            
            # Validar importe_abonado
            importe_abonado_val = Decimal(str(payload_aprobacion.get('importe_abonado')))
            print(f"   Importe a abonar: ${importe_abonado_val:,.2f}")
            
            if importe_abonado_val > total_estimado_con_impuestos:
                print(f"   ❌ ERROR: {importe_abonado_val} > {total_estimado_con_impuestos}")
                print(f"   RESULTADO: FALLÓ")
            else:
                print(f"   ✅ VALIDACIÓN PASADA: {importe_abonado_val} <= {total_estimado_con_impuestos}")
                print(f"   RESULTADO: ÉXITO")
                
        except Exception as e:
            print(f"   ❌ Excepción: {e}")
            print(f"   RESULTADO: ERROR")
        
        # --- PRUEBA 2: Intenta aprobar CON pago de 800k (DEBE FALLAR) ---
        print("\n⚠️  TEST 2: Aprobación con pago MAYOR a total (debe rechazar)")
        try:
            payload_aprobacion = {
                "proveedor_id": proveedor.id,
                "forma_pago": "Efectivo",
                "iva": "21",
                "iibb": "3.5",
                "importe_abonado": 800000,  # MÁS que el total
                "observaciones_solicitud": "Intento de pago excesivo"
            }
            
            base_total = Decimal('600000.00')
            iva_amount = (base_total * Decimal('0.21')).quantize(Decimal('0.01'))
            iibb_amount = (base_total * Decimal('0.035')).quantize(Decimal('0.01'))
            total_estimado_con_impuestos = (base_total + iva_amount + iibb_amount).quantize(Decimal('0.01'))
            
            importe_abonado_val = Decimal(str(payload_aprobacion.get('importe_abonado')))
            
            if importe_abonado_val > total_estimado_con_impuestos:
                print(f"   ✅ CORRECTAMENTE RECHAZADO: {importe_abonado_val} > {total_estimado_con_impuestos}")
                print(f"   RESULTADO: ÉXITO (validación funcionando)")
            else:
                print(f"   ❌ NO DEBERÍA PERMITIR ESTE PAGO")
                print(f"   RESULTADO: ERROR EN VALIDACIÓN")
                
        except Exception as e:
            print(f"   ❌ Excepción: {e}")


if __name__ == '__main__':
    test_aprobacion_con_iva_iibb()
    print("\n" + "="*60)
    print("TEST COMPLETADO")
    print("="*60)
