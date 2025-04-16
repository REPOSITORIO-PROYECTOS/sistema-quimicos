# -*- coding: utf-8 -*-
# Archivo: api.py (MODO SIMULADO - Margen Fijo x Producto - vRegistroVenta - CON DATOS EJEMPLO)

import sys
import os
import traceback
import math
import datetime
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import or_
from sqlalchemy.orm.exc import NoResultFound

# --- Configuración Flask ---
app = Flask(__name__)
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = os.environ.get("DB_PORT", "3306")
DB_NAME = os.environ.get("DB_NAME", "quimex_db")
DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/quimex_db"
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL #'mysql+pymysql://usuario:password@host/quimex_db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
print("--- INFO [api.py]: Iniciando API Flask (MODO SIMULADO - Margen x Producto) ---")

# --- Importación del Core ---
try:
    from calculator.core import obtener_coeficiente_por_rango
    print("--- INFO [api.py]: Módulo 'calculator.core' importado correctamente.")
except ImportError as e:
    print(f"\n--- ERROR FATAL [api.py]: No se pudo importar 'calculator.core'. Error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"\n--- ERROR FATAL [api.py]: Error cargando 'calculator.core': {e}")
    traceback.print_exc()
    sys.exit(1)


# --- DATOS SIMULADOS (PRODUCTOS CON MARGEN FIJO - CON VALORES DE EJEMPLO) ---
# ¡¡AJUSTA ESTOS VALORES DE costo Y margen SEGÚN NECESITES!!
PRODUCTOS_SIMULADOS = [
    #                                                                                         vvvvvv MARGEN FIJO vvvvvv
    {"id": 1, "codigo": "IMG-001", "nombre": "DETERGENTE", "unidad_venta": "KG", "tipo_calculo": "PL", "ref_calculo": "1", "costo": 5.50, "margen": 0.20}, # Margen 20%
    {"id": 2, "codigo": "IMG-002", "nombre": "ACEITE LAVAC", "unidad_venta": "LT", "tipo_calculo": "PL", "ref_calculo": "10", "costo": 12.75, "margen": 0.35}, # Margen 35%
    {"id": 3, "codigo": "IMG-003", "nombre": "ABRILLANTAD", "unidad_venta": "LT", "tipo_calculo": "PD", "ref_calculo": "1", "costo": 8.20, "margen": 0.40}, # Margen 40%
    {"id": 4, "codigo": "IMG-004", "nombre": "ABRILLANTAD PLUS", "unidad_venta": "LT", "tipo_calculo": "PD", "ref_calculo": "1", "costo": 9.00, "margen": 0.40}, # Margen 40%
    {"id": 5, "codigo": "IMG-005", "nombre": "ACE 66", "unidad_venta": "KG", "tipo_calculo": "PL", "ref_calculo": "5", "costo": 7.80, "margen": 0.25}, # Margen 25%
    {"id": 6, "codigo": "IMG-006", "nombre": "ACEITE 108", "unidad_venta": "LT", "tipo_calculo": "PL", "ref_calculo": "10", "costo": 15.20, "margen": 0.30}, # Margen 30%
    {"id": 7, "codigo": "IMG-007", "nombre": "ACEITE ANAN.", "unidad_venta": "LT", "tipo_calculo": "PL", "ref_calculo": "10", "costo": 14.90, "margen": 0.30}, # Margen 30%
    {"id": 8, "codigo": "IMG-008", "nombre": "ACEITE ARIEL", "unidad_venta": "LT", "tipo_calculo": "PL", "ref_calculo": "10", "costo": 16.00, "margen": 0.33}, # Margen 33%
    {"id": 9, "codigo": "IMG-009", "nombre": "ACEITE ARIEL CONCENTRADO", "unidad_venta": "LT", "tipo_calculo": "PL", "ref_calculo": "20", "costo": 22.50, "margen": 0.45}, # Margen 45%
    {"id": 10, "codigo": "IMG-010", "nombre": "ACEITE ARPEI", "unidad_venta": "LT", "tipo_calculo": "PL", "ref_calculo": "10", "costo": 13.80, "margen": 0.28}, # Margen 28%
    {"id": 11, "codigo": "IMG-011", "nombre": "ACEITE CANEI", "unidad_venta": "LT", "tipo_calculo": "PL", "ref_calculo": "10", "costo": 14.10, "margen": 0.30}, # Margen 30%
    {"id": 12, "codigo": "IMG-012", "nombre": "ACEITE CHERI", "unidad_venta": "LT", "tipo_calculo": "PL", "ref_calculo": "10", "costo": 15.50, "margen": 0.32}, # Margen 32%
    {"id": 13, "codigo": "PROD-LIM-001", "nombre": "Limpiador Desengrasante Industrial", "unidad_venta": "bidon x 5L", "tipo_calculo": "PL", "ref_calculo": "5", "costo": 45.00, "margen": 0.55}, # Margen 55%
    {"id": 14, "codigo": "PROD-SOLV-002", "nombre": "Solvente Dieléctrico Alpha", "unidad_venta": "lata x 1kg", "tipo_calculo": "PD", "ref_calculo": "1000", "costo": 25.00, "margen": 0.50}, # Margen 50%
    {"id": 15, "codigo": "PROD-ACID-003", "nombre": "Ácido Sulfúrico Diluido 10%", "unidad_venta": "litro", "tipo_calculo": "PD", "ref_calculo": "0,1", "costo": 3.10, "margen": 0.60}, # Margen 60%
]

# --- DATOS SIMULADOS (Usuarios, Ventas, Contador - Sin cambios) ---
USUARIOS_SIMULADOS = [{"id": 1, "nombre": "Usuario Admin"}, {"id": 2, "nombre": "Vendedor 1"}]
VENTAS_REGISTRADAS = {}
VENTA_ID_COUNTER = 0

# --- Funciones Auxiliares (Sin cambios) ---
def _find_product(product_id):
    return next((prod for prod in PRODUCTOS_SIMULADOS if prod['id'] == product_id), None)
def _validate_user(user_id):
    return next((user for user in USUARIOS_SIMULADOS if user['id'] == user_id), None)
def _get_next_venta_id():
    global VENTA_ID_COUNTER
    VENTA_ID_COUNTER += 1
    return VENTA_ID_COUNTER

# --- Endpoint: Calcular Precio (Usa Margen Fijo) ---
@app.route('/calculate_price', methods=['POST'])
def calculate_price():
    print("\n--- INFO [api.py]: Recibida solicitud POST en /calculate_price ---")
    data = request.get_json()

    if not data:
        return jsonify({"status": "error", "message": "No se recibió payload JSON"}), 400

    product_id_input = data.get('product_id')
    quantity_str_input = data.get('quantity')

    missing = []
    if product_id_input is None: missing.append('product_id')
    if quantity_str_input is None: missing.append('quantity')
    if missing:
        return jsonify({"status": "error", "message": f"Faltan parámetros requeridos: {', '.join(missing)}"}), 400

    try:
        product_id = int(product_id_input)
        quantity_str = str(quantity_str_input).strip()
        quantity_float = float(quantity_str.replace(',', '.'))
        if quantity_float <= 0:
            return jsonify({"status": "error", "message": "La cantidad debe ser positiva."}), 400
    except (ValueError, TypeError):
        return jsonify({"status": "error", "message": "ID debe ser entero y cantidad debe ser número válido."}), 400
    except Exception as e:
        print(f"--- ERROR [api.py]: Error validando entrada /calculate_price: {e}")
        return jsonify({"status": "error", "message": "Error procesando datos de entrada."}), 500

    print(f"--- DEBUG [api.py]: Calculando precio para ID: {product_id}, Cantidad: '{quantity_str}' ({quantity_float})")

    producto = db.session.query(Producto).filter_by(id=product_id).first()
    if not producto:
        return jsonify({"status": "error", "message": f"Producto con ID {product_id} no encontrado"}), 404

    tipo_calculo = producto.tipo_calculo
    ref_calculo = producto.ref_calculo
    costo_base = producto.costo
    margen_decimal = producto.margen
    unidad_venta = producto.unidad_venta or "N/A"

    missing_data = []
    if not tipo_calculo: missing_data.append('tipo_calculo')
    if ref_calculo is None: missing_data.append('ref_calculo')
    if costo_base is None or not isinstance(costo_base, (int, float)) or costo_base < 0:
        missing_data.append('costo (inválido)')
    if margen_decimal is None or not isinstance(margen_decimal, (int, float)) or margen_decimal >= 1 or margen_decimal < 0:
        missing_data.append(f'margen (inválido: {margen_decimal})')

    if missing_data:
        print(f"--- ERROR [api.py]: Producto ID {product_id} mal configurado. Falta/Inválido: {', '.join(missing_data)}")
        return jsonify({"status": "error", "message": f"Producto ID {product_id} no tiene datos de cálculo completos o válidos."}), 400

    ref_calculo_str = str(ref_calculo)
    print(f"--- DEBUG [api.py]: Datos para cálculo: Tipo='{tipo_calculo}', Ref='{ref_calculo_str}', Costo={costo_base}, Margen={margen_decimal}")

    try:
        coeficiente = obtener_coeficiente_por_rango(ref_calculo_str, quantity_str, tipo_calculo)
        print(f"--- DEBUG [api.py]: Coeficiente obtenido: {coeficiente}")

        if coeficiente is not None:
            try:
                denominador = 1 - margen_decimal
                precio_venta_unitario = round((costo_base / denominador) * coeficiente, 2)
                precio_total_calculado = round(precio_venta_unitario * quantity_float, 2)

                response_data = {
                    "status": "success", "product_id_solicitado": product_id,
                    "nombre_producto": producto.nombre,
                    "cantidad_solicitada": quantity_float, "unidad_venta": unidad_venta,
                    "margen_aplicado": margen_decimal, "costo_base_unitario": costo_base,
                    "tipo_calculo_usado": tipo_calculo, "referencia_interna_usada": ref_calculo_str,
                    "coeficiente_aplicado": coeficiente, "precio_venta_unitario": precio_venta_unitario,
                    "precio_total_calculado": precio_total_calculado
                }
                print(f"--- INFO [api.py]: Precio calculado exitosamente: {response_data}")
                return jsonify(response_data), 200

            except Exception as calc_err:
                print(f"--- ERROR [api.py]: Error durante el cálculo del precio: {calc_err}")
                traceback.print_exc()
                return jsonify({"status": "error", "message": "Error interno durante el cálculo del precio final."}), 500
        else:
            return jsonify({
                "status": "not_found", "reason": "coefficient_not_found",
                "product_id_solicitado": product_id, "nombre_producto": producto.nombre,
                "cantidad_solicitada": quantity_float, "unidad_venta": unidad_venta,
                "margen_del_producto": margen_decimal, "costo_base": costo_base,
                "tipo_calculo_intentado": tipo_calculo, "referencia_interna_intentada": ref_calculo_str,
                "message": "No se encontró coeficiente aplicable, no se puede calcular precio."
            }), 404

    except Exception as e:
        print(f"--- ERROR CRITICO [api.py]: Error inesperado en /calculate_price: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Error interno grave al procesar la solicitud."}), 500
    """
    Calcula precio unitario/total para producto y cantidad.
    Usa el MARGEN FIJO definido en los datos del producto.
    Espera JSON: {"product_id": <id>, "quantity": "<cantidad_str>"}
    Devuelve JSON con detalles del cálculo o un error.
    """
    print("\n--- INFO [api.py]: Recibida solicitud POST en /calculate_price ---")
    data = request.get_json()

    if not data: return jsonify({"status": "error", "message": "No se recibió payload JSON"}), 400

    product_id_input = data.get('product_id')
    quantity_str_input = data.get('quantity')

    missing = []
    if product_id_input is None: missing.append('product_id')
    if quantity_str_input is None: missing.append('quantity')
    if missing: return jsonify({"status": "error", "message": f"Faltan parámetros requeridos: {', '.join(missing)}"}), 400

    try:
        product_id = int(product_id_input)
        quantity_str = str(quantity_str_input).strip()
        quantity_float = float(quantity_str.replace(',', '.'))
        if quantity_float <= 0: return jsonify({"status": "error", "message": "La cantidad debe ser positiva."}), 400
    except (ValueError, TypeError):
        return jsonify({"status": "error", "message": "ID debe ser entero y cantidad debe ser número válido."}), 400
    except Exception as e:
        print(f"--- ERROR [api.py]: Error validando entrada /calculate_price: {e}")
        return jsonify({"status": "error", "message": "Error procesando datos de entrada."}), 500

    print(f"--- DEBUG [api.py]: Calculando precio para ID: {product_id}, Cantidad: '{quantity_str}' ({quantity_float})")

    producto_encontrado = _find_product(product_id)
    if not producto_encontrado: return jsonify({"status": "error", "message": f"Producto con ID {product_id} no encontrado"}), 404

    tipo_calculo = producto_encontrado.get('tipo_calculo')
    ref_calculo = producto_encontrado.get('ref_calculo')
    costo_base = producto_encontrado.get('costo')
    margen_decimal = producto_encontrado.get('margen')
    unidad_venta = producto_encontrado.get('unidad_venta', 'N/A')

    missing_data = []
    if not tipo_calculo: missing_data.append('tipo_calculo')
    if ref_calculo is None: missing_data.append('ref_calculo')
    if costo_base is None or not isinstance(costo_base, (int, float)) or costo_base < 0: missing_data.append('costo (inválido)')
    if margen_decimal is None or not isinstance(margen_decimal, (int, float)) or margen_decimal >= 1 or margen_decimal < 0: missing_data.append(f'margen (inválido: {margen_decimal})')

    if missing_data:
        print(f"--- ERROR [api.py]: Producto ID {product_id} mal configurado. Falta/Inválido: {', '.join(missing_data)}")
        return jsonify({"status": "error", "message": f"Producto ID {product_id} no tiene datos de cálculo completos o válidos (costo, margen<1, tipo, ref)."}), 400

    ref_calculo_str = str(ref_calculo)
    print(f"--- DEBUG [api.py]: Datos para cálculo: Tipo='{tipo_calculo}', Ref='{ref_calculo_str}', Costo={costo_base}, Margen={margen_decimal}")

    try:
        coeficiente = obtener_coeficiente_por_rango(ref_calculo_str, quantity_str, tipo_calculo)
        print(f"--- DEBUG [api.py]: Coeficiente obtenido: {coeficiente}")

        if coeficiente is not None:
            try:
                denominador = 1 - margen_decimal
                precio_venta_unitario = round((costo_base / denominador) * coeficiente, 2)
                precio_total_calculado = round(precio_venta_unitario * quantity_float, 2)
                print(f"--- DEBUG [api.py]: Precio Unitario: {precio_venta_unitario}, Precio Total: {precio_total_calculado}")

                response_data = {
                    "status": "success", "product_id_solicitado": product_id,
                    "nombre_producto": producto_encontrado.get("nombre", "N/A"),
                    "cantidad_solicitada": quantity_float, "unidad_venta": unidad_venta,
                    "margen_aplicado": margen_decimal, "costo_base_unitario": costo_base,
                    "tipo_calculo_usado": tipo_calculo, "referencia_interna_usada": ref_calculo_str,
                    "coeficiente_aplicado": coeficiente, "precio_venta_unitario": precio_venta_unitario,
                    "precio_total_calculado": precio_total_calculado
                }
                print(f"--- INFO [api.py]: Precio calculado exitosamente: {response_data}")
                return jsonify(response_data), 200

            except Exception as calc_err:
                print(f"--- ERROR [api.py]: Error durante el cálculo del precio: {calc_err}")
                traceback.print_exc()
                return jsonify({"status": "error", "message": "Error interno durante el cálculo del precio final."}), 500
        else:
            print(f"--- INFO [api.py]: No se encontró coeficiente aplicable.")
            return jsonify({
                "status": "not_found", "reason": "coefficient_not_found",
                "product_id_solicitado": product_id, "nombre_producto": producto_encontrado.get("nombre", "N/A"),
                "cantidad_solicitada": quantity_float, "unidad_venta": unidad_venta,
                "margen_del_producto": margen_decimal, "costo_base": costo_base,
                "tipo_calculo_intentado": tipo_calculo, "referencia_interna_intentada": ref_calculo_str,
                "message": "No se encontró coeficiente aplicable, no se puede calcular precio."
            }), 404

    except Exception as e:
        print(f"--- ERROR CRITICO [api.py]: Error inesperado en /calculate_price: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Error interno grave al procesar la solicitud."}), 500

# --- FIN Endpoint Calcular Precio ---


# --- Endpoint: Registrar Nueva Venta (Usa Margen Fijo) ---
@app.route('/register_sale', methods=['POST'])
def register_sale():
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "No se recibió payload JSON"}), 400

    user_id = data.get('usuario_interno_id')
    if not user_id or not isinstance(user_id, int):
        return jsonify({"status": "error", "message": "usuario_interno_id inválido"}), 400

    usuario = UsuarioInterno.query.get(user_id)
    if not usuario:
        return jsonify({"status": "error", "message": f"Usuario ID {user_id} no encontrado"}), 401

    items = data.get('items')
    if not items or not isinstance(items, list):
        return jsonify({"status": "error", "message": "Items inválidos"}), 400

    detalles = []
    monto_total = 0

    try:
        for idx, item in enumerate(items):
            product_id = item.get("product_id")
            quantity_str = str(item.get("quantity", "")).strip().replace(',', '.')

            try:
                product_id = int(product_id)
                quantity = float(quantity_str)
                if quantity <= 0:
                    raise ValueError("Cantidad no válida")
            except Exception:
                return jsonify({"status": "error", "message": f"Item #{idx+1}: Datos inválidos"}), 400

            producto = Producto.query.get(product_id)
            if not producto:
                return jsonify({"status": "error", "message": f"Producto ID {product_id} no encontrado"}), 404

            if not all([producto.tipo_calculo, producto.ref_calculo is not None, producto.costo is not None]):
                return jsonify({"status": "error", "message": f"Producto ID {product_id} mal configurado"}), 400

            if producto.margen is None or not (0 <= producto.margen < 1):
                return jsonify({"status": "error", "message": f"Producto ID {product_id}: margen inválido"}), 400

            coef = obtener_coeficiente_por_rango(str(producto.ref_calculo), quantity_str, producto.tipo_calculo)
            if coef is None:
                return jsonify({"status": "error", "message": f"Producto ID {product_id}: coeficiente no encontrado"}), 400

            denominador = 1 - producto.margen
            precio_unitario = round((producto.costo / denominador) * coef, 2)
            total_item = round(precio_unitario * quantity, 2)

            detalle = DetalleVenta(
                producto_id=product_id,
                cantidad=quantity,
                margen_aplicado=producto.margen,
                costo_unitario_momento=producto.costo,
                coeficiente_usado=coef,
                precio_unitario_venta=precio_unitario,
                precio_total_item=total_item
            )
            detalles.append(detalle)
            monto_total += total_item

        nueva_venta = Venta(
            usuario_interno_id=user_id,
            cliente_id=data.get('cliente_id'),
            fecha_pedido=data.get('fecha_pedido'),
            direccion_entrega=data.get('direccion_entrega'),
            cuit_cliente=data.get('cuit_cliente'),
            observaciones=data.get('observaciones'),
            monto_total=round(monto_total, 2)
        )
        db.session.add(nueva_venta)
        db.session.flush()  # Para obtener el ID generado

        for d in detalles:
            d.venta_id = nueva_venta.id
            db.session.add(d)

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Venta registrada exitosamente.",
            "venta_id": nueva_venta.id,
            "monto_total_calculado": round(monto_total, 2)
        }), 201

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"status": "error", "message": f"Error interno al registrar venta: {str(e)}"}), 500

# --- FIN Endpoint Registrar Venta ---


# --- Endpoint: Modificar Venta Existente (Usa Margen Fijo) ---
@app.route('/update_sale/<int:venta_id>', methods=['PUT'])
def update_sale(venta_id):
    """
    Actualiza una venta usando base de datos real. Reemplaza cabecera permitida y TODOS los ítems.
    Espera JSON: items [{product_id, quantity}], y opcionalmente: cliente_id, fecha_pedido, direccion_entrega, cuit_cliente, observaciones.
    """
    from sqlalchemy.orm.exc import NoResultFound

    print(f"\n--- INFO [api.py]: Recibida solicitud PUT en /update_sale/{venta_id} ---")
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "No se recibió payload JSON"}), 400

    items = data.get('items')
    if not items or not isinstance(items, list) or len(items) == 0:
        return jsonify({"status": "error", "message": "Se requiere una lista válida de 'items'"}), 400

    try:
        venta = db.session.query(Venta).filter_by(id=venta_id).one()
    except NoResultFound:
        return jsonify({"status": "error", "message": f"Venta ID {venta_id} no encontrada"}), 404

    nuevos_detalles = []
    nuevo_monto_total = 0

    for index, item in enumerate(items):
        product_id = item.get('product_id')
        quantity_str = str(item.get('quantity')).strip()

        if not product_id or not quantity_str:
            return jsonify({"status": "error", "message": f"Item #{index+1} incompleto"}), 400

        try:
            quantity = float(quantity_str.replace(",", "."))
            if quantity <= 0:
                return jsonify({"status": "error", "message": f"Cantidad inválida en item #{index+1}"}), 400

            producto = db.session.query(Producto).filter_by(id=product_id).first()
            if not producto:
                return jsonify({"status": "error", "message": f"Producto ID {product_id} no encontrado"}), 404

            coeficiente = obtener_coeficiente_por_rango(
                str(producto.ref_calculo),
                quantity_str,
                producto.tipo_calculo
            )
            if coeficiente is None:
                return jsonify({"status": "error", "message": f"No se encontró coeficiente para producto ID {product_id}"}), 400

            denominador = 1 - producto.margen
            precio_unitario = round((producto.costo / denominador) * coeficiente, 2)
            precio_total_item = round(precio_unitario * quantity, 2)

            nuevo_detalle = DetalleVenta(
                venta_id=venta_id,
                producto_id=product_id,
                cantidad=quantity,
                margen_aplicado=producto.margen,
                costo_unitario_momento=producto.costo,
                coeficiente_usado=coeficiente,
                precio_unitario_venta=precio_unitario,
                precio_total_item=precio_total_item
            )
            nuevos_detalles.append(nuevo_detalle)
            nuevo_monto_total += precio_total_item

        except Exception as e:
            print(f"--- ERROR procesando item #{index+1}: {e}")
            traceback.print_exc()
            return jsonify({"status": "error", "message": f"Error procesando item #{index+1}"}), 500

    try:
        # Eliminar ítems anteriores
        db.session.query(DetalleVenta).filter_by(venta_id=venta_id).delete()

        # Actualizar venta
        venta.cliente_id = data.get('cliente_id', venta.cliente_id)
        venta.fecha_pedido = data.get('fecha_pedido', venta.fecha_pedido)
        venta.direccion_entrega = data.get('direccion_entrega', venta.direccion_entrega)
        venta.cuit_cliente = data.get('cuit_cliente', venta.cuit_cliente)
        venta.observaciones = data.get('observaciones', venta.observaciones)
        venta.fecha_modificacion = datetime.datetime.utcnow()
        venta.monto_total = round(nuevo_monto_total, 2)

        # Agregar nuevos detalles
        db.session.add_all(nuevos_detalles)
        db.session.commit()

        print(f"--- INFO: Venta ID {venta_id} actualizada correctamente.")
        return jsonify({
            "status": "success",
            "message": "Venta actualizada correctamente",
            "venta_id": venta_id,
            "monto_total_actualizado": venta.monto_total
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"--- ERROR al guardar venta ID {venta_id}: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Error al actualizar la venta"}), 500

# --- FIN Endpoint Modificar Venta ---


# --- Endpoint GET /sale/<id> (Sin cambios) ---
@app.route('/get_sale/<int:venta_id>', methods=['GET'])
def get_sale(venta_id):
    """
    Obtiene los datos completos de una venta específica, incluyendo detalles de productos.
    """

    print(f"\n--- INFO: Recibida solicitud GET en /get_sale/{venta_id} ---")
    venta = None
    try:
        venta = db.session.query(Venta).filter_by(id=venta_id).one()
    except NoResultFound:
        return jsonify({"status": "error", "message": f"Venta ID {venta_id} no encontrada"}), 404

    try:
        detalles = db.session.query(DetalleVenta).filter_by(venta_id=venta.id).all()
        detalles_serializados = []
        for detalle in detalles:
            producto = db.session.query(Producto).filter_by(id=detalle.producto_id).first()
            detalles_serializados.append({
                "producto_id": detalle.producto_id,
                "nombre_producto": producto.nombre if producto else "Desconocido",
                "cantidad": detalle.cantidad,
                "margen_aplicado": detalle.margen_aplicado,
                "costo_unitario_momento": detalle.costo_unitario_momento,
                "coeficiente_usado": detalle.coeficiente_usado,
                "precio_unitario_venta": detalle.precio_unitario_venta,
                "precio_total_item": detalle.precio_total_item
            })

        venta_serializada = {
            "venta_id": venta.id,
            "cliente_id": venta.cliente_id,
            "fecha_pedido": venta.fecha_pedido.isoformat() if venta.fecha_pedido else None,
            "direccion_entrega": venta.direccion_entrega,
            "cuit_cliente": venta.cuit_cliente,
            "observaciones": venta.observaciones,
            "monto_total": venta.monto_total,
            "fecha_creacion": venta.fecha_creacion.isoformat() if venta.fecha_creacion else None,
            "fecha_modificacion": venta.fecha_modificacion.isoformat() if venta.fecha_modificacion else None,
            "detalles": detalles_serializados
        }

        return jsonify({
            "status": "success",
            "venta": venta_serializada
        }), 200

    except Exception as e:
        print(f"--- ERROR al recuperar venta: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Error al recuperar la venta"}), 500



# --- Endpoint Legado y Búsqueda (Sin cambios) ---
@app.route('/calculate_coefficient_legacy', methods=['POST'])
def calculate_coefficient_legacy():
    # ... (código legacy sin cambios) ...
    print("\n--- INFO [api.py]: Recibida solicitud POST en /calculate_coefficient_legacy ---")
    data = request.get_json()
    if not data: return jsonify({"status": "error", "message": "No se recibió payload JSON"}), 400
    tipo_str = data.get('tipo'); ref_str = data.get('ref'); qty_str = data.get('qty')
    missing = [k for k, v in {'tipo': tipo_str, 'ref': ref_str, 'qty': qty_str}.items() if v is None]
    if missing: return jsonify({"status": "error", "message": f"Faltan parámetros: {', '.join(missing)}"}), 400
    try:
        tipo_str=str(tipo_str).strip().upper(); ref_str=str(ref_str).strip(); qty_str=str(qty_str).strip()
        if not tipo_str or not ref_str or not qty_str: return jsonify({"status": "error", "message": "Parámetros no pueden estar vacíos."}), 400
        coeficiente = obtener_coeficiente_por_rango(ref_str, qty_str, tipo_str)
        if coeficiente is not None: return jsonify({"status": "success", "tipo_producto": tipo_str, "referencia": ref_str, "cantidad_solicitada": qty_str, "coeficiente": coeficiente}), 200
        else: return jsonify({"status": "not_found", "tipo_producto": tipo_str, "referencia": ref_str, "cantidad_solicitada": qty_str, "message": "No se encontró coeficiente."}), 404
    except Exception as e: print(f"ERROR en legacy: {e}"); traceback.print_exc(); return jsonify({"status": "error", "message": "Error interno"}), 500

@app.route('/search_products', methods=['POST'])
def search_products():
    """
    Busca productos por nombre, código o familia en la base de datos con paginación.
    Espera JSON con:
        - search_term: str
        - page: int (opcional, default=1)
        - per_page: int (opcional, default=10)
    """
    data = request.get_json()
    search_term = data.get("search_term", "").strip()
    page = int(data.get("page", 1))
    per_page = int(data.get("per_page", 10))

    if page < 1: page = 1
    if per_page < 1: per_page = 10

    print(f"\n--- INFO: Búsqueda paginada de productos: término='{search_term}', página={page}, por página={per_page}")

    if not search_term:
        return jsonify({"status": "error", "message": "Debe proporcionar un término de búsqueda."}), 400

    try:
        term_like = f"%{search_term.lower()}%"

        # Query base
        query = db.session.query(Producto).filter(
            or_(
                Producto.nombre.ilike(term_like),
                Producto.codigo.ilike(term_like),
                Producto.familia.ilike(term_like)
            )
        )

        total_resultados = query.count()
        productos = query.offset((page - 1) * per_page).limit(per_page).all()

        productos_serializados = [
            {
                "id": p.id,
                "codigo": p.codigo,
                "nombre": p.nombre,
                "familia": p.familia,
                "unidad_medida": p.unidad_medida,
                "costo_unitario": p.costo_unitario,
                "coeficiente": p.coeficiente
            }
            for p in productos
        ]

        return jsonify({
            "status": "success",
            "productos": productos_serializados,
            "pagination": {
                "total": total_resultados,
                "page": page,
                "per_page": per_page,
                "total_pages": (total_resultados + per_page - 1) // per_page
            }
        }), 200

    except Exception as e:
        print(f"--- ERROR al buscar productos: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Error al buscar productos."}), 500




# --- Punto de Entrada (Actualizar descripciones) ---
if __name__ == "__main__":
    print("\n--- Iniciando Servidor Flask API (MODO SIMULADO - Margen Fijo x Producto) ---")
    print("Endpoints disponibles:")
    print("  POST /calculate_price (JSON: {\"product_id\": <id>, \"quantity\": \"<qty_str_num>\"})")
    print("  POST /register_sale   (JSON: {\"usuario_interno_id\", \"items\": [{\"product_id\", \"quantity\"}], ...})")
    print("  GET  /sale/<venta_id>")
    print("  PUT  /update_sale/<venta_id> (JSON: {\"cliente_id\"?, ..., \"items\": [{\"product_id\", \"quantity\"}]})")
    print("  POST /calculate_coefficient_legacy (JSON: {tipo, ref, qty})")
    print("  GET  /search_products?term=<texto>")
    # ... (resto del bloque main sin cambios) ...
    print("---"); print(f"Directorio actual: {os.getcwd()}"); print(f"Python ejecutable: {sys.executable}"); print("---")
    print("Intentando iniciar en host=0.0.0.0, port=5000, debug=True"); print("Usa Ctrl+C para detener el servidor.")
    try: app.run(host='0.0.0.0', port=5000, debug=True)
    except OSError as os_err: print(f"\n--- ERROR AL INICIAR FLASK ---"); print(f"Error: {os_err}"); sys.exit(1)
    except Exception as start_err: print(f"\n--- ERROR INESPERADO AL INICIAR FLASK ---"); print(f"{type(start_err).__name__}: {start_err}"); traceback.print_exc(); sys.exit(1)
    print("\n--- Servidor Flask API Detenido ---")