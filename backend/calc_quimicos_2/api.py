# -*- coding: utf-8 -*-
# Archivo: api.py (MODO SIMULADO - Margen Fijo x Producto - vRegistroVenta - CON DATOS EJEMPLO)

import sys
import os
import traceback
import math
import datetime
from flask import Flask, request, jsonify

# --- Configuración Flask ---
app = Flask(__name__)
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
    """
    Registra una nueva venta (simulado). Usa el MARGEN FIJO del producto.
    Espera JSON: {usuario_interno_id, cliente_id (opc), ..., items: [{product_id, quantity}]}
    Devuelve JSON con resultado o error.
    """
    print("\n--- INFO [api.py]: Recibida solicitud POST en /register_sale ---")
    data = request.get_json()

    if not data: return jsonify({"status": "error", "message": "No se recibió payload JSON"}), 400

    user_id = data.get('usuario_interno_id')
    if user_id is None: return jsonify({"status": "error", "message": "Falta 'usuario_interno_id'"}), 400
    try:
        user_id = int(user_id)
        if not _validate_user(user_id): return jsonify({"status": "error", "message": f"Usuario interno ID {user_id} no válido"}), 401
    except ValueError: return jsonify({"status": "error", "message": "'usuario_interno_id' debe ser un número"}), 400

    items = data.get('items')
    if not items or not isinstance(items, list) or len(items) == 0:
        return jsonify({"status": "error", "message": "La lista 'items' es requerida (con product_id y quantity)"}), 400

    detalles_venta_calculados = []
    monto_total_venta = 0
    fecha_registro_actual = datetime.datetime.utcnow().isoformat() + "Z"

    for index, item in enumerate(items):
        product_id = item.get('product_id')
        quantity_str = item.get('quantity')

        if product_id is None or quantity_str is None: return jsonify({"status": "error", "message": f"Item #{index+1} incompleto (faltan product_id o quantity)"}), 400

        try:
            product_id = int(product_id)
            quantity_str = str(quantity_str).strip()
            quantity_float = float(quantity_str.replace(',', '.'))
            if quantity_float <= 0: return jsonify({"status": "error", "message": f"Item #{index+1} (ID:{product_id}): la cantidad debe ser positiva."}), 400

            producto = _find_product(product_id)
            if not producto: return jsonify({"status": "error", "message": f"Item #{index+1}: Producto ID {product_id} no encontrado"}), 404

            tipo_calculo = producto.get('tipo_calculo')
            ref_calculo = producto.get('ref_calculo')
            costo_base = producto.get('costo')
            margen_decimal = producto.get('margen') # <-- OBTENER MARGEN FIJO

            missing_data = []
            if not tipo_calculo: missing_data.append('tipo_calculo')
            if ref_calculo is None: missing_data.append('ref_calculo')
            if costo_base is None: missing_data.append('costo')
            if margen_decimal is None or margen_decimal >= 1 or margen_decimal < 0: missing_data.append('margen')
            if missing_data: return jsonify({"status": "error", "message": f"Item #{index+1} (ID:{product_id}): Producto mal configurado ({', '.join(missing_data)})"}), 400

            ref_calculo_str = str(ref_calculo)
            coeficiente = obtener_coeficiente_por_rango(ref_calculo_str, quantity_str, tipo_calculo)
            if coeficiente is None: return jsonify({"status": "error", "reason":"coefficient_not_found", "message": f"Item #{index+1} (ID:{product_id}): No se encontró coeficiente", "product_id_error": product_id}), 400

            denominador = 1 - margen_decimal
            precio_unitario = round((costo_base / denominador) * coeficiente, 2)
            precio_total_item = round(precio_unitario * quantity_float, 2)

            detalles_venta_calculados.append({
                "product_id": product_id, "nombre_producto": producto.get("nombre", "N/A"),
                "unidad_venta": producto.get("unidad_venta", "N/A"), "cantidad": quantity_float,
                "margen_aplicado": margen_decimal, "costo_unitario_momento": costo_base,
                "coeficiente_usado": coeficiente, "precio_unitario_venta": precio_unitario,
                "precio_total_item": precio_total_item
            })
            monto_total_venta += precio_total_item

        except (ValueError, TypeError) as e: return jsonify({"status": "error", "message": f"Item #{index+1}: Datos inválidos - {e}"}), 400
        except Exception as e_item:
             print(f"--- ERROR [api.py]: Error procesando item #{index+1} (ID:{product_id}): {e_item}")
             traceback.print_exc()
             return jsonify({"status": "error", "message": f"Error interno procesando el item con ID {product_id}"}), 500

    try:
        nueva_venta_id = _get_next_venta_id()
        venta_data = {
            "id": nueva_venta_id, "usuario_interno_id": user_id,
            "cliente_id": data.get('cliente_id'), "fecha_registro": fecha_registro_actual,
            "fecha_pedido": data.get('fecha_pedido'), "direccion_entrega": data.get('direccion_entrega'),
            "cuit_cliente": data.get('cuit_cliente'), "observaciones": data.get('observaciones'),
            "monto_total": round(monto_total_venta, 2), "items": detalles_venta_calculados
        }
        VENTAS_REGISTRADAS[nueva_venta_id] = venta_data
        print(f"--- INFO [api.py]: Venta simulada registrada con ID: {nueva_venta_id}")

        return jsonify({
            "status": "success", "message": "Venta registrada exitosamente (simulado).",
            "venta_id": nueva_venta_id, "monto_total_calculado": round(monto_total_venta, 2)
        }), 201

    except Exception as e_final:
        print(f"--- ERROR [api.py]: Error finalizando registro de venta: {e_final}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Error interno al finalizar el registro"}), 500

# --- FIN Endpoint Registrar Venta ---


# --- Endpoint: Modificar Venta Existente (Usa Margen Fijo) ---
@app.route('/update_sale/<int:venta_id>', methods=['PUT'])
def update_sale(venta_id):
    """
    Actualiza una venta (simulado). Usa MARGEN FIJO del producto.
    Espera JSON similar a /register_sale (sin usuario_id, items solo con product_id y quantity).
    Reemplaza cabecera (campos permitidos) y TODOS los items.
    """
    print(f"\n--- INFO [api.py]: Recibida solicitud PUT en /update_sale/{venta_id} ---")

    if venta_id not in VENTAS_REGISTRADAS: return jsonify({"status": "error", "message": f"Venta ID {venta_id} no encontrada"}), 404
    data = request.get_json()
    if not data: return jsonify({"status": "error", "message": "No se recibió payload JSON"}), 400
    items = data.get('items')
    if not items or not isinstance(items, list) or len(items) == 0: return jsonify({"status": "error", "message": "La lista 'items' (con product_id y quantity) es requerida"}), 400

    nuevos_detalles_calculados = []
    nuevo_monto_total = 0
    fecha_registro_original = VENTAS_REGISTRADAS[venta_id]['fecha_registro']
    usuario_original = VENTAS_REGISTRADAS[venta_id]['usuario_interno_id']

    for index, item in enumerate(items): # Bucle para procesar y recalcular items
        product_id = item.get('product_id')
        quantity_str = item.get('quantity')
        if product_id is None or quantity_str is None: return jsonify({"status": "error", "message": f"Nuevo Item #{index+1} incompleto"}), 400
        try:
            product_id = int(product_id)
            quantity_str = str(quantity_str).strip()
            quantity_float = float(quantity_str.replace(',', '.'))
            if quantity_float <= 0: return jsonify({"status": "error", "message": f"Nuevo Item #{index+1} (ID:{product_id}): cantidad inválida."}), 400
            producto = _find_product(product_id)
            if not producto: return jsonify({"status": "error", "message": f"Nuevo Item #{index+1}: Producto ID {product_id} no encontrado"}), 404
            tipo_calculo = producto.get('tipo_calculo'); ref_calculo = producto.get('ref_calculo'); costo_base = producto.get('costo'); margen_decimal = producto.get('margen') # Obtener margen fijo
            missing_data = [f for f, v in {'tipo': tipo_calculo, 'ref': ref_calculo, 'costo': costo_base, 'margen': margen_decimal}.items() if v is None or (f=='margen' and (v>=1 or v<0)) or (f=='costo' and v<0)]
            if missing_data: return jsonify({"status": "error", "message": f"Nuevo Item #{index+1} (ID:{product_id}): Producto mal configurado ({', '.join(missing_data)})"}), 400
            ref_calculo_str = str(ref_calculo)
            coeficiente = obtener_coeficiente_por_rango(ref_calculo_str, quantity_str, tipo_calculo)
            if coeficiente is None: return jsonify({"status": "error", "message": f"Nuevo Item #{index+1} (ID:{product_id}): No se encontró coeficiente"}), 400
            denominador = 1 - margen_decimal
            precio_unitario = round((costo_base / denominador) * coeficiente, 2)
            precio_total_item = round(precio_unitario * quantity_float, 2)
            nuevos_detalles_calculados.append({
                "product_id": product_id, "nombre_producto": producto.get("nombre", "N/A"), "unidad_venta": producto.get("unidad_venta", "N/A"),
                "cantidad": quantity_float, "margen_aplicado": margen_decimal, "costo_unitario_momento": costo_base,
                "coeficiente_usado": coeficiente, "precio_unitario_venta": precio_unitario, "precio_total_item": precio_total_item })
            nuevo_monto_total += precio_total_item
        except (ValueError, TypeError) as e: return jsonify({"status": "error", "message": f"Nuevo Item #{index+1}: Datos inválidos - {e}"}), 400
        except Exception as e_item: print(f"ERROR procesando item {index+1} en update: {e_item}"); traceback.print_exc(); return jsonify({"status": "error", "message": f"Error interno procesando el nuevo item ID {product_id}"}), 500

    try: # "Actualizar" Venta en memoria
        venta_actualizada_data = {
            "id": venta_id, "usuario_interno_id": usuario_original,
            "cliente_id": data.get('cliente_id', VENTAS_REGISTRADAS[venta_id]['cliente_id']),
            "fecha_registro": fecha_registro_original, "fecha_modificacion": datetime.datetime.utcnow().isoformat() + "Z",
            "fecha_pedido": data.get('fecha_pedido', VENTAS_REGISTRADAS[venta_id]['fecha_pedido']),
            "direccion_entrega": data.get('direccion_entrega', VENTAS_REGISTRADAS[venta_id]['direccion_entrega']),
            "cuit_cliente": data.get('cuit_cliente', VENTAS_REGISTRADAS[venta_id]['cuit_cliente']),
            "observaciones": data.get('observaciones', VENTAS_REGISTRADAS[venta_id]['observaciones']),
            "monto_total": round(nuevo_monto_total, 2), "items": nuevos_detalles_calculados }
        VENTAS_REGISTRADAS[venta_id] = venta_actualizada_data
        print(f"--- INFO [api.py]: Venta simulada ACTUALIZADA ID: {venta_id}")
        return jsonify({"status": "success", "message": "Venta actualizada (simulado).", "venta_id": venta_id, "monto_total_actualizado": round(nuevo_monto_total, 2)}), 200
    except Exception as e_final: print(f"ERROR finalizando update venta ID {venta_id}: {e_final}"); traceback.print_exc(); return jsonify({"status": "error", "message": "Error interno al finalizar la actualización"}), 500

# --- FIN Endpoint Modificar Venta ---


# --- Endpoint GET /sale/<id> (Sin cambios) ---
@app.route('/sale/<int:venta_id>', methods=['GET'])
def get_sale(venta_id):
    # ... (código sin cambios) ...
    print(f"\n--- INFO [api.py]: Recibida solicitud GET en /sale/{venta_id} ---")
    venta_encontrada = VENTAS_REGISTRADAS.get(venta_id)
    if not venta_encontrada: return jsonify({"status": "error", "message": f"Venta ID {venta_id} no encontrada"}), 404
    print(f"--- INFO [api.py]: Devolviendo datos de venta ID: {venta_id}")
    return jsonify(venta_encontrada), 200


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

@app.route('/search_products', methods=['GET'])
def search_products():
    # ... (código search sin cambios) ...
    term = request.args.get('term', '').strip().lower()
    print(f"\n--- INFO [api.py]: Recibida solicitud GET en /search_products?term={term} ---")
    if not term: return jsonify([])
    resultados = [{"id": prod['id'], "codigo": prod['codigo'], "nombre": prod['nombre'], "unidad_venta": prod['unidad_venta']}
                  for prod in PRODUCTOS_SIMULADOS if term in prod['nombre'].lower()]
    print(f"--- DEBUG [api.py]: Productos encontrados para '{term}': {len(resultados)}")
    return jsonify(resultados), 200


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