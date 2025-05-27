# app/blueprints/combos.py

from flask import Blueprint, request, jsonify
from decimal import Decimal
from models import db, Combo, ComboComponente, Producto, Receta 
from calculator.core import obtener_coeficiente_por_rango
from sqlalchemy.exc import IntegrityError
import traceback

combos_bp = Blueprint('combos_bp', __name__, url_prefix='/combos')

# --- FUNCIONES AUXILIARES DE CÁLCULO (ENFOCADAS EN USD) ---

def _obtener_costo_producto_usd_directo(producto: Producto) -> Decimal:
    """
    Obtiene el costo directo en USD de un producto.
    Si el producto es una receta, calcula el costo de la receta en USD.
    """
    if not producto:
        return Decimal('0.0')

    if producto.es_receta and producto.receta:
        # Calcular costo de la receta en USD
        costo_receta_usd = Decimal('0.0')
        for item_receta in producto.receta.items:
            if item_receta.ingrediente: # ingrediente es un Producto
                costo_ingrediente_usd = _obtener_costo_producto_usd_directo(item_receta.ingrediente)
                # Asumimos que el porcentaje se aplica al costo del ingrediente.
                # La lógica de "cantidad de producción de receta" vs "porcentaje" es clave aquí.
                # Si el porcentaje es para 1 unidad de la receta final:
                contribucion_costo_item = (Decimal(str(item_receta.porcentaje)) / Decimal('100.0')) * costo_ingrediente_usd
                costo_receta_usd += contribucion_costo_item
        return costo_receta_usd.quantize(Decimal('0.0001'))
    else:
        # Es un producto simple, usar su costo_referencia_usd
        if producto.costo_referencia_usd is not None:
            return Decimal(str(producto.costo_referencia_usd)).quantize(Decimal('0.0001'))
        else:
            print(f"ADVERTENCIA: Producto simple {producto.id} ('{producto.nombre}') no tiene costo_referencia_usd.")
            return Decimal('0.0')


def calcular_costo_y_precio_base_combo_usd(combo_id: int):
    """
    Calcula el costo total en USD de los componentes de un combo
    y el precio base en USD del combo aplicando su margen.
    """
    combo = Combo.query.get(combo_id)
    if not combo:
        return None

    costo_total_combo_usd = Decimal('0.0')
    componentes_info_costo = []

    for comp_combo in combo.componentes:
        if comp_combo.producto:
            costo_unitario_componente_usd = _obtener_costo_producto_usd_directo(comp_combo.producto)
            cantidad_componente = Decimal(str(comp_combo.cantidad))
            costo_linea_componente_usd = cantidad_componente * costo_unitario_componente_usd
            costo_total_combo_usd += costo_linea_componente_usd
            
            componentes_info_costo.append({
                "producto_id": comp_combo.producto_id,
                "nombre_componente": comp_combo.producto.nombre,
                "cantidad": float(cantidad_componente),
                "costo_unitario_usd": float(costo_unitario_componente_usd.quantize(Decimal('0.01'))),
                "costo_linea_usd": float(costo_linea_componente_usd.quantize(Decimal('0.01')))
            })
        else: # No debería ocurrir si los componentes siempre tienen producto_id
             componentes_info_costo.append({
                "producto_id": None, "nombre_componente": "ERROR: Sin producto",
                "cantidad": float(comp_combo.cantidad), "costo_unitario_usd": 0.0, "costo_linea_usd": 0.0
            })


    margen_del_combo = Decimal(str(combo.margen_combo))
    # Precio Base USD = Costo Total USD / (1 - Margen)
    precio_base_combo_usd = Decimal('0.0')
    if Decimal('1.0') - margen_del_combo > Decimal('0.000001'): # Evitar división por cero si margen es 100%
        precio_base_combo_usd = costo_total_combo_usd / (Decimal('1.0') - margen_del_combo)
    else: # Si margen es 100% o más, el precio se vuelve infinito o negativo, manejar este caso.
        print(f"ADVERTENCIA: Margen de combo {combo.id} es >= 100%, resultando en precio base no calculable de esta forma.")
        # Podrías asignar un precio muy alto o manejarlo como un error.

    return {
        'combo_id': combo.id,
        'nombre_combo': combo.nombre,
        'margen_combo_aplicado': float(margen_del_combo),
        'costo_total_combo_usd': float(costo_total_combo_usd.quantize(Decimal('0.01'))),
        'precio_base_combo_usd': float(precio_base_combo_usd.quantize(Decimal('0.01'))), # Este es el que usarás como 'ref_calculo'
        'componentes_detalle_costo_usd': componentes_info_costo
    }

# --- Endpoints CRUD ---

# [CREATE] Crear un nuevo combo
@combos_bp.route('/crear', methods=['POST'])
def crear_combo():
    data = request.get_json()
    if not data: return jsonify({"error": "No se recibió payload JSON"}), 400

    nombre_combo = data.get('nombre')
    margen_combo_str = data.get('margen_combo') # Espera el margen del combo
    componentes_data = data.get('componentes', [])

    if not nombre_combo: return jsonify({"error": "El campo 'nombre' es requerido"}), 400
    if margen_combo_str is None: return jsonify({"error": "El campo 'margen_combo' es requerido"}), 400
    
    try:
        margen_decimal = Decimal(str(margen_combo_str))
        if not (Decimal('0') <= margen_decimal < Decimal('1')):
            return jsonify({"error": "El margen_combo debe estar entre 0 (inclusive) y 1 (exclusive)"}), 400
    except Exception:
        return jsonify({"error": "Valor de 'margen_combo' inválido"}), 400

    if Combo.query.filter(Combo.nombre.ilike(nombre_combo)).first():
        return jsonify({"error": f"Un combo con el nombre '{nombre_combo}' ya existe"}), 409
    if not isinstance(componentes_data, list) or not componentes_data:
        return jsonify({"error": "Se requiere una lista de 'componentes' y no puede estar vacía"}), 400

    try:
        nuevo_combo = Combo(
            nombre=nombre_combo,
            sku_combo=data.get('sku_combo'),
            descripcion=data.get('descripcion'),
            margen_combo=margen_decimal, # Guardar el margen validado
            activo=data.get('activo', True)
        )

        list_componentes_obj = []
        for comp_data in componentes_data:
            producto_id = comp_data.get('producto_id')
            cantidad_str = comp_data.get('cantidad')

            if not producto_id or cantidad_str is None:
                return jsonify({"error": "Cada componente debe tener 'producto_id' y 'cantidad'"}), 400
            
            producto_componente = Producto.query.get(producto_id)
            if not producto_componente:
                return jsonify({"error": f"Producto con id {producto_id} no encontrado"}), 404
            
            try:
                cantidad_decimal = Decimal(str(cantidad_str))
                if cantidad_decimal <= Decimal('0'): raise ValueError()
            except Exception:
                return jsonify({"error": f"Cantidad inválida para componente con producto_id {producto_id}"}), 400

            componente_obj = ComboComponente(producto_id=producto_id, cantidad=cantidad_decimal)
            list_componentes_obj.append(componente_obj)
        
        db.session.add(nuevo_combo)
        nuevo_combo.componentes.extend(list_componentes_obj)
        db.session.commit()
        
        info_calculada_usd = calcular_costo_y_precio_base_combo_usd(nuevo_combo.id)
        return jsonify(nuevo_combo.to_dict(incluir_componentes=True, info_calculada=info_calculada_usd)), 201

    except IntegrityError as e: # Captura IntegrityError de SQLAlchemy
        db.session.rollback()
        print(f"IntegrityError al crear combo: {e.orig}") # Log del error original de DB
        detalle_error = str(e.orig)
        if "UNIQUE constraint failed: combos.nombre" in detalle_error:
            msg = f"Un combo con el nombre '{nombre_combo}' ya existe."
        elif "UNIQUE constraint failed: combos.sku_combo" in detalle_error and data.get('sku_combo'):
            msg = f"Un combo con el SKU '{data.get('sku_combo')}' ya existe."
        else:
            msg = 'Error de integridad de base de datos al crear el combo.'
        return jsonify({'error': msg, 'detalle_db': detalle_error}), 409
    except ValueError as ve: # Captura ValueErrors de las validaciones de Decimal o margen
        db.session.rollback()
        print(f"ValueError al crear combo: {ve}")
        return jsonify({'error': str(ve)}), 400
    except Exception as e:
        db.session.rollback()
        print(f"Error inesperado al crear combo: {traceback.format_exc()}")
        return jsonify({'error': 'Ocurrió un error inesperado al crear el combo'}), 500

# Endpoint para obtener los precios ARS calculados por tu calculator.core
@combos_bp.route('/obtener_precios_ars/<int:combo_id>', methods=['GET'])
def obtener_precios_ars_combo(combo_id):
    cantidad_a_cotizar_str = request.args.get('cantidad_cotizar', '1') # Cantidad del combo a cotizar
    # Aquí debes definir qué TIPO de producto usa tu calculator.core para combos.
    # Podría ser un tipo fijo como "COMBO" o "CB", o configurable.
    tipo_producto_para_calculadora = "CB" # EJEMPLO: Usa "CB" para combos en tu calculator

    try:
        cantidad_a_cotizar = Decimal(cantidad_a_cotizar_str)
        if cantidad_a_cotizar <= 0:
            return jsonify({"error": "La 'cantidad_cotizar' debe ser positiva"}), 400
    except Exception:
        return jsonify({"error": "Valor de 'cantidad_cotizar' inválido"}), 400

    info_base_usd = calcular_costo_y_precio_base_combo_usd(combo_id)
    if not info_base_usd:
        return jsonify({'error': 'Combo no encontrado o no se pudo calcular su información base USD'}), 404

    precio_base_usd_combo = Decimal(str(info_base_usd['precio_base_combo_usd']))

    if precio_base_usd_combo <= Decimal('0'):
        return jsonify({
            "advertencia": "El precio base USD del combo es cero o negativo, no se puede calcular precio ARS.",
            "info_base_usd": info_base_usd
        }), 400 # O 200 con advertencia

    # Llamar a tu calculadora
    # obtener_coeficiente_por_rango(ref_str, qty_str, tipo_str)
    # ref_str será el precio_base_usd_combo
    # qty_str será la cantidad_a_cotizar_str
    # tipo_str será el tipo definido para combos
    try:
        # Tu calculadora espera strings
        coeficiente = obtener_coeficiente_por_rango(
            str(precio_base_usd_combo.quantize(Decimal('0.01'))), # Referencia es el precio USD
            str(cantidad_a_cotizar.quantize(Decimal('0.0001'))), # Cantidad del combo
            tipo_producto_para_calculadora
        )
    except Exception as e_calc:
        print(f"Error llamando a calculator.core: {traceback.format_exc()}")
        return jsonify({"error": "Error al calcular coeficiente con calculator.core", "detalle": str(e_calc)}), 500

    if coeficiente is not None:
        precio_unitario_ars_calculado = precio_base_usd_combo * Decimal(str(coeficiente))
        precio_total_ars_calculado = cantidad_a_cotizar * precio_unitario_ars_calculado
        
        return jsonify({
            "combo_id": combo_id,
            "nombre_combo": info_base_usd['nombre_combo'],
            "cantidad_cotizada_combo": float(cantidad_a_cotizar),
            "precio_base_usd_combo_unitario": info_base_usd['precio_base_combo_usd'],
            "tipo_producto_usado_calculadora": tipo_producto_para_calculadora,
            "coeficiente_aplicado": float(coeficiente),
            "precio_unitario_ars_combo": float(precio_unitario_ars_calculado.quantize(Decimal('0.01'))),
            "precio_total_ars_combo_para_cantidad_cotizada": float(precio_total_ars_calculado.quantize(Decimal('0.01'))),
            "info_costo_usd_combo": info_base_usd # Opcional: devolver también el desglose de costos
        }), 200
    else:
        return jsonify({
            "error": "No se encontró coeficiente aplicable en calculator.core para este combo y cantidad.",
            "combo_id": combo_id,
            "precio_base_usd_combo_usado_como_ref": info_base_usd['precio_base_combo_usd'],
            "cantidad_combo_cotizada": float(cantidad_a_cotizar),
            "tipo_producto_usado_calculadora": tipo_producto_para_calculadora,
        }), 404


# GET /api/v1/combos (sin cambios mayores, pero ahora to_dict puede recibir info_calculada)
@combos_bp.route('/obtener-todos', methods=['GET'])
def obtener_combos():
    incluir_componentes = request.args.get('incluir_componentes', 'false').lower() == 'true'
    incluir_info_usd = request.args.get('incluir_info_usd', 'false').lower() == 'true'
    
    try:
        combos = Combo.query.order_by(Combo.nombre).all()
        resultado = []
        for c in combos:
            info_calc_usd = calcular_costo_y_precio_base_combo_usd(c.id) if incluir_info_usd else None
            resultado.append(c.to_dict(incluir_componentes=incluir_componentes, info_calculada=info_calc_usd))
        return jsonify(resultado), 200
    except Exception as e:
        print(f"Error inesperado al obtener combos: {traceback.format_exc()}")
        return jsonify({'error': 'Ocurrió un error inesperado al obtener los combos'}), 500

# GET /api/v1/combos/<combo_id>
@combos_bp.route('/obtener/<int:combo_id>', methods=['GET'])
def obtener_combo_por_id(combo_id):
    incluir_componentes = request.args.get('incluir_componentes', 'true').lower() == 'true'
    incluir_info_usd = request.args.get('incluir_info_usd', 'true').lower() == 'true'

    combo = Combo.query.get(combo_id)
    if not combo:
        return jsonify({'error': 'Combo no encontrado'}), 404
    
    info_calc_usd = calcular_costo_y_precio_base_combo_usd(combo.id) if incluir_info_usd else None
    return jsonify(combo.to_dict(incluir_componentes=incluir_componentes, info_calculada=info_calc_usd)), 200


# PUT /api/v1/combos/<combo_id> (Actualizar combo)
@combos_bp.route('/editar/<int:combo_id>', methods=['PUT'])
def actualizar_combo(combo_id):
    combo = Combo.query.get(combo_id)
    if not combo: return jsonify({'error': 'Combo no encontrado'}), 404

    data = request.get_json()
    if not data: return jsonify({"error": "No se recibió payload JSON"}), 400

    try:
        # Actualizar campos del Combo
        if 'nombre' in data:
            nuevo_nombre = data['nombre']
            if nuevo_nombre != combo.nombre and Combo.query.filter(Combo.nombre.ilike(nuevo_nombre)).filter(Combo.id != combo_id).first():
                return jsonify({"error": f"Otro combo ya existe con el nombre '{nuevo_nombre}'"}), 409
            combo.nombre = nuevo_nombre
        if 'sku_combo' in data:
            nuevo_sku = data.get('sku_combo')
            if nuevo_sku and nuevo_sku != combo.sku_combo and Combo.query.filter_by(sku_combo=nuevo_sku).filter(Combo.id != combo_id).first():
                return jsonify({"error": f"Otro combo ya existe con el SKU '{nuevo_sku}'"}), 409
            combo.sku_combo = nuevo_sku # Permite ponerlo a None si se envía así
        if 'descripcion' in data: combo.descripcion = data['descripcion']
        if 'activo' in data: combo.activo = data['activo']
        if 'margen_combo' in data:
            try:
                margen_decimal = Decimal(str(data['margen_combo']))
                if not (Decimal('0') <= margen_decimal < Decimal('1')):
                    return jsonify({"error": "El margen_combo debe estar entre 0 y 1"}), 400
                combo.margen_combo = margen_decimal
            except Exception:
                return jsonify({"error": "Valor de 'margen_combo' inválido"}), 400

        # Actualizar componentes (borrar y recrear)
        if 'componentes' in data:
            componentes_data = data.get('componentes', [])
            if not isinstance(componentes_data, list): # No es necesario si se recrean, pero buena práctica
                 return jsonify({"error": "El campo 'componentes' debe ser una lista"}), 400

            # Borrar componentes antiguos asociados al combo
            for comp_existente in combo.componentes:
                db.session.delete(comp_existente)
            
            nuevos_componentes_obj = []
            for comp_data in componentes_data:
                producto_id = comp_data.get('producto_id')
                cantidad_str = comp_data.get('cantidad')
                if not producto_id or cantidad_str is None:
                    db.session.rollback()
                    return jsonify({"error": "Cada componente debe tener 'producto_id' y 'cantidad'"}), 400
                producto_componente = Producto.query.get(producto_id)
                if not producto_componente:
                    db.session.rollback()
                    return jsonify({"error": f"Producto con id {producto_id} no encontrado"}), 404
                try:
                    cantidad_decimal = Decimal(str(cantidad_str))
                    if cantidad_decimal <= Decimal('0'): raise ValueError()
                except Exception:
                    db.session.rollback()
                    return jsonify({"error": f"Cantidad inválida para producto_id {producto_id}"}), 400
                
                componente_obj = ComboComponente(producto_id=producto_id, cantidad=cantidad_decimal)
                nuevos_componentes_obj.append(componente_obj)
            combo.componentes = nuevos_componentes_obj # Reasigna la colección entera
            
        db.session.commit()
        info_calculada_usd = calcular_costo_y_precio_base_combo_usd(combo.id)
        return jsonify(combo.to_dict(incluir_componentes=True, info_calculada=info_calculada_usd)), 200

    except IntegrityError as e:
        db.session.rollback()
        print(f"IntegrityError al actualizar combo: {e.orig}")
        detalle_error = str(e.orig)
        return jsonify({'error': 'Error de integridad. ¿Nombre o SKU duplicado?', 'detalle_db': detalle_error}), 409
    except ValueError as ve:
        db.session.rollback()
        return jsonify({'error': str(ve)}), 400
    except Exception as e:
        db.session.rollback()
        print(f"Error inesperado al actualizar combo: {traceback.format_exc()}")
        return jsonify({'error': 'Ocurrió un error inesperado al actualizar el combo'}), 500


# DELETE /api/v1/combos/<combo_id>
@combos_bp.route('/eliminar/<int:combo_id>', methods=['DELETE'])
def eliminar_combo(combo_id):
    combo = Combo.query.get(combo_id)
    if not combo: return jsonify({'error': 'Combo no encontrado'}), 404
    try:
        db.session.delete(combo)
        db.session.commit()
        return '', 204
    except Exception as e:
        db.session.rollback()
        print(f"Error inesperado al eliminar combo: {traceback.format_exc()}")
        return jsonify({'error': 'Ocurrió un error inesperado al eliminar el combo'}), 500