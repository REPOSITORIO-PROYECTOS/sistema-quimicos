import sys
import os
from decimal import Decimal, InvalidOperation
import math

# Añadir el directorio raíz del proyecto al path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app import create_app, db
from app.models import Venta, DetalleVenta, Producto
from app.blueprints.ventas import calcular_precio_item_venta, calcular_monto_final_y_vuelto

# Datos extraídos de la tabla proporcionada por el usuario
datos_a_recuperar = {
    1775: [{'producto_id': 42, 'cantidad': '40'}],
    1788: [{'producto_id': 212, 'cantidad': '5'}, {'producto_id': 110, 'cantidad': '5'}],
    1789: [{'producto_id': 92, 'cantidad': '50'}, {'producto_id': 210, 'cantidad': '100'}, {'producto_id': 223, 'cantidad': '15'}, {'producto_id': 78, 'cantidad': '10'}],
    1794: [{'producto_id': 135, 'cantidad': '10'}, {'producto_id': 135, 'cantidad': '110'}, {'producto_id': 213, 'cantidad': '10'}, {'producto_id': 211, 'cantidad': '20'}, {'producto_id': 271, 'cantidad': '30'}, {'producto_id': 111, 'cantidad': '100'}, {'producto_id': 65, 'cantidad': '6'}],
    1798: [{'producto_id': 92, 'cantidad': '100'}, {'producto_id': 73, 'cantidad': '10'}, {'producto_id': 111, 'cantidad': '40'}],
    1801: [{'producto_id': 51, 'cantidad': '50'}, {'producto_id': 280, 'cantidad': '20'}, {'producto_id': 92, 'cantidad': '10'}, {'producto_id': 228, 'cantidad': '5'}, {'producto_id': 198, 'cantidad': '1'}, {'producto_id': 153, 'cantidad': '0.5'}, {'producto_id': 69, 'cantidad': '1'}],
    1805: [{'producto_id': 92, 'cantidad': '100'}, {'producto_id': 194, 'cantidad': '1'}],
    1806: [{'producto_id': 92, 'cantidad': '50'}, {'producto_id': 50, 'cantidad': '10'}, {'producto_id': 111, 'cantidad': '10'}, {'producto_id': 157, 'cantidad': '0.5'}],
    1808: [{'producto_id': 1004, 'cantidad': '5'}, {'producto_id': 280, 'cantidad': '5'}, {'producto_id': 176, 'cantidad': '0.25'}, {'producto_id': 167, 'cantidad': '0.25'}, {'producto_id': 275, 'cantidad': '5'}, {'producto_id': 147, 'cantidad': '5'}, {'producto_id': 192, 'cantidad': '1'}, {'producto_id': 212, 'cantidad': '5'}, {'producto_id': 228, 'cantidad': '5'}, {'producto_id': 50, 'cantidad': '20'}, {'producto_id': 92, 'cantidad': '10'}, {'producto_id': 272, 'cantidad': '10'}, {'producto_id': 279, 'cantidad': '10'}, {'producto_id': 256, 'cantidad': '5'}],
    1813: [{'producto_id': 92, 'cantidad': '100'}, {'producto_id': 256, 'cantidad': '10'}, {'producto_id': 50, 'cantidad': '40'}],
    1823: [{'producto_id': 210, 'cantidad': '50'}, {'producto_id': 211, 'cantidad': '5'}, {'producto_id': 51, 'cantidad': '15'}, {'producto_id': 163, 'cantidad': '1'}, {'producto_id': 169, 'cantidad': '1'}, {'producto_id': 161, 'cantidad': '1'}, {'producto_id': 171, 'cantidad': '1'}, {'producto_id': 167, 'cantidad': '1'}, {'producto_id': 200, 'cantidad': '5'}],
    1832: [{'producto_id': 86, 'cantidad': '10'}, {'producto_id': 89, 'cantidad': '10'}, {'producto_id': 264, 'cantidad': '10'}],
    1860: [{'producto_id': 185, 'cantidad': '50'}, {'producto_id': 112, 'cantidad': '10'}, {'producto_id': 283, 'cantidad': '10'}, {'producto_id': 42, 'cantidad': '10'}, {'producto_id': 205, 'cantidad': '5'}],
    1868: [{'producto_id': 185, 'cantidad': '20'}, {'producto_id': 62, 'cantidad': '5'}, {'producto_id': 24, 'cantidad': '0.25'}],
    1872: [{'producto_id': 132, 'cantidad': '450'}, {'producto_id': 283, 'cantidad': '20'}],
    1878: [{'producto_id': 135, 'cantidad': '100'}, {'producto_id': 234, 'cantidad': '5'}, {'producto_id': 1003, 'cantidad': '0.5'}, {'producto_id': 19, 'cantidad': '0.5'}, {'producto_id': 25, 'cantidad': '0.5'}, {'producto_id': 100, 'cantidad': '0.1'}],
    1880: [{'producto_id': 110, 'cantidad': '20'}, {'producto_id': 211, 'cantidad': '10'}, {'producto_id': 36, 'cantidad': '1'}, {'producto_id': 206, 'cantidad': '1'}, {'producto_id': 61, 'cantidad': '10'}],
    1888: [{'producto_id': 228, 'cantidad': '10'}, {'producto_id': 280, 'cantidad': '10'}, {'producto_id': 51, 'cantidad': '10'}, {'producto_id': 92, 'cantidad': '30'}, {'producto_id': 73, 'cantidad': '10'}, {'producto_id': 94, 'cantidad': '1'}, {'producto_id': 210, 'cantidad': '10'}, {'producto_id': 63, 'cantidad': '5'}, {'producto_id': 65, 'cantidad': '6'}, {'producto_id': 201, 'cantidad': '10'}],
    1894: [{'producto_id': 60, 'cantidad': '60'}, {'producto_id': 92, 'cantidad': '10'}],
    1896: [{'producto_id': 112, 'cantidad': '20'}, {'producto_id': 41, 'cantidad': '5'}],
}

def reconstruir_ventas_automatico():
    """
    Script automático para reconstruir los detalles de múltiples ventas
    basado en un diccionario de datos predefinido.
    """
    app = create_app()
    with app.app_context():
        print("--- Script de Reconstrucción Automática de Ventas ---")
        
        ventas_a_reparar_ids = list(datos_a_recuperar.keys())
        print(f"Se intentarán reparar {len(ventas_a_reparar_ids)} ventas.")

        for venta_id, items_nuevos_data in datos_a_recuperar.items():
            try:
                venta = db.session.get(Venta, venta_id)
                if not venta:
                    print(f"\nERROR: Venta con ID {venta_id} no encontrada. Saltando...")
                    continue

                print(f"\n--- Procesando Venta ID: {venta_id} | Cliente: {venta.cliente_id} ---")

                # Borrar detalles existentes para evitar duplicados
                DetalleVenta.query.filter_by(venta_id=venta_id).delete()
                db.session.flush()
                print(f"Detalles antiguos para la venta {venta_id} eliminados.")

                monto_total_base_nuevo = Decimal("0.00")
                detalles_para_guardar = []

                for item_data in items_nuevos_data:
                    producto_id = item_data['producto_id']
                    cantidad = Decimal(str(item_data['cantidad']))

                    # Recalcular precio de cada ítem
                    precio_u, precio_t, costo_u, _, error_msg, _ = calcular_precio_item_venta(
                        producto_id, cantidad, venta.cliente_id
                    )
                    
                    if error_msg:
                        raise Exception(f"Error al calcular precio para producto {producto_id}: {error_msg}")

                    detalle = DetalleVenta(
                        venta_id=venta.id,
                        producto_id=producto_id,
                        cantidad=cantidad,
                        precio_unitario_venta_ars=precio_u,
                        precio_total_item_ars=precio_t,
                        costo_unitario_momento_ars=costo_u
                    )
                    detalles_para_guardar.append(detalle)
                    monto_total_base_nuevo += precio_t

                # Actualizar la venta principal con los montos recalculados
                venta.monto_total = monto_total_base_nuevo.quantize(Decimal('0.01'))
                
                monto_con_recargos, recargo_t, recargo_f, _, _ = calcular_monto_final_y_vuelto(
                    venta.monto_total, venta.forma_pago, venta.requiere_factura
                )
                
                descuento_general = getattr(venta, 'descuento_general', Decimal('0.0')) or Decimal('0.0')
                monto_final_a_pagar = monto_con_recargos * (Decimal(1) - descuento_general / Decimal(100))
                monto_final_redondeado = Decimal(math.ceil(monto_final_a_pagar / 100) * 100)

                venta.recargo_transferencia = recargo_t
                venta.recargo_factura = recargo_f
                venta.monto_final_con_recargos = monto_final_a_pagar
                venta.monto_final_redondeado = monto_final_redondeado
                
                db.session.add_all(detalles_para_guardar)
                db.session.commit()
                
                print(f"¡ÉXITO! Venta {venta_id} reconstruida con {len(detalles_para_guardar)} ítems.")
                print(f"  - Nuevo Monto Base: {venta.monto_total}")
                print(f"  - Nuevo Monto Final Redondeado: {venta.monto_final_redondeado}")

            except Exception as e:
                db.session.rollback()
                print(f"\nERROR FATAL al procesar la venta {venta_id}. Se revirtieron los cambios para esta venta.")
                print(f"  - Motivo: {e}")
                import traceback
                traceback.print_exc()

if __name__ == '__main__':
    reconstruir_ventas_automatico()
