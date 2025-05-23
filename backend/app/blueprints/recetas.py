# app/blueprints/recetas.py
from flask import Blueprint, request, jsonify
from decimal import Decimal, InvalidOperation
import traceback
import datetime

# --- Modelos y DB ---
# Ajusta la ruta según tu estructura final (asumiendo que utils está al mismo nivel que blueprints)
from ..models import db, Producto, Receta, RecetaItem
# --- Utils ---
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES
from ..utils.costos_utils import calcular_costo_producto

# Quitado si no se usa aquí: from .productos import producto_a_dict

recetas_bp = Blueprint('recetas', __name__, url_prefix='/recetas')

# --- Helper para serializar ---
def receta_a_dict(receta: Receta) -> dict:
    """Convierte un objeto Receta a un diccionario serializable."""
    if not receta:
        return None

    producto_final_info = None
    if receta.producto_final:
        producto_final_info = {
            "id": receta.producto_final.id,
            "nombre": receta.producto_final.nombre
        }

    # Nota: Si la relación Receta.items es lazy='dynamic', necesitarás receta.items.all()
    # Si es lazy='select' (default) o joined/subquery, esto funciona pero puede causar N+1 si no está bien cargado.
    items_list = []
    for item in receta.items:
         items_list.append({
             "ingrediente_id": item.ingrediente_id,
             # Añadir chequeos por si acaso ingrediente es None (integridad BD)
             "ingrediente_codigo": item.ingrediente.id if item.ingrediente else 'N/A',
             "ingrediente_nombre": item.ingrediente.nombre if item.ingrediente else 'N/A',
             "porcentaje": float(item.porcentaje) if item.porcentaje is not None else None
         })


    return {
        "id": receta.id,
        "producto_final": producto_final_info,
        "items": items_list,
        "fecha_creacion": receta.fecha_creacion.isoformat() if receta.fecha_creacion else None,
        "fecha_modificacion": receta.fecha_modificacion.isoformat() if receta.fecha_modificacion else None,
    }

# --- Funciones de validación reutilizables ---
def validar_items_receta(items_payload: list, producto_final_id: int) -> tuple[list[RecetaItem] | None, Decimal | None, tuple[jsonify, int] | None]:
    """
    Valida la lista de items de una receta.
    Retorna (lista_items_db, total_porcentaje, None) si es válido,
    o (None, None, (respuesta_error, codigo_http)) si hay error.
    """
    if not isinstance(items_payload, list):
        return None, None, (jsonify({"error": "'items' debe ser una lista"}), 400)
    # Permitir lista vacía podría tener sentido en una actualización para borrar todo?
    # if not items_payload:
    #     return None, None, (jsonify({"error": "'items' no puede estar vacía"}), 400)

    items_db = []
    total_porcentaje = Decimal(0)
    ids_ingredientes = set()

    for item_data in items_payload:
        ingrediente_id = item_data.get('ingrediente_id')
        porcentaje_payload = item_data.get('porcentaje') # Obtener directo

        if ingrediente_id is None or porcentaje_payload is None: # Chequear None explícitamente
            return None, None, (jsonify({"error": "Falta 'ingrediente_id' o 'porcentaje' en un item"}), 400)

        # Validar tipo ingrediente_id
        if not isinstance(ingrediente_id, int):
             return None, None, (jsonify({"error": f"Valor de 'ingrediente_id' ({ingrediente_id}) inválido, debe ser entero"}), 400)

        # Intentar convertir a string y quitar espacios antes de Decimal
        porcentaje_str = str(porcentaje_payload).strip()
        if not porcentaje_str:
             return None, None, (jsonify({"error": f"Porcentaje vacío o inválido para ingrediente ID {ingrediente_id}"}), 400)

        try:
            porcentaje = Decimal(porcentaje_str)
        except InvalidOperation:
             return None, None, (jsonify({"error": f"Porcentaje '{porcentaje_payload}' no es un número válido para ingrediente ID {ingrediente_id}"}), 400)


        if porcentaje <= 0:
            return None, None, (jsonify({"error": f"Porcentaje debe ser mayor a 0 para ingrediente ID {ingrediente_id}"}), 400)

        ingrediente = db.session.get(Producto, ingrediente_id)
        if not ingrediente:
            return None, None, (jsonify({"error": f"Ingrediente ID {ingrediente_id} no encontrado"}), 404) # 404 Not Found es más apropiado

        if ingrediente_id == producto_final_id:
            return None, None, (jsonify({"error": "Un producto no puede ser ingrediente de su propia receta"}), 400)

        # Verificar duplicados dentro de esta misma receta
        if ingrediente_id in ids_ingredientes:
            return None, None, (jsonify({"error": f"El ingrediente ID {ingrediente_id} ('{ingrediente.nombre}') está duplicado en la lista de items."}), 400)
        ids_ingredientes.add(ingrediente_id)

        # Opcional: Verificar si el ingrediente es a su vez una receta (depende de tu lógica)
        # if ingrediente.es_receta:
        #     return None, None, (jsonify({"error": f"El ingrediente '{ingrediente.nombre}' (ID: {ingrediente_id}) es una receta y no puede ser usado como ingrediente directo"}), 400)

        items_db.append(RecetaItem(ingrediente_id=ingrediente_id, porcentaje=porcentaje))
        total_porcentaje += porcentaje

    # Validación suma de porcentajes (solo si hay items)
    if items_db and abs(total_porcentaje - Decimal(100)) > Decimal('0.01'): # Tolerancia pequeña
        return None, None, (jsonify({"error": f"La suma de porcentajes ({total_porcentaje}%) debe ser 100%"}), 400)

    # Si la lista de items está vacía, el total es 0, lo cual es válido si se permite
    if not items_db and total_porcentaje != Decimal(0):
         # Esto no debería ocurrir lógicamente, pero por si acaso
         return None, None, (jsonify({"error": "Error interno en cálculo de porcentaje"}), 500)


    return items_db, total_porcentaje, None # Éxito


# --- Endpoints ---

@recetas_bp.route('/crear', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'])
def crear_receta(current_user):
    data = request.get_json()
    if not data or 'producto_final_id' not in data or 'items' not in data:
        return jsonify({"error": "Faltan datos requeridos: 'producto_final_id' y 'items'"}), 400

    producto_final_id = data.get('producto_final_id')
    items_payload = data.get('items')

    if not isinstance(producto_final_id, int):
        return jsonify({"error": "'producto_final_id' debe ser un número entero"}), 400

    producto_final = db.session.get(Producto, producto_final_id)
    if not producto_final:
        return jsonify({"error": f"Producto final con ID {producto_final_id} no existe"}), 404

    # Verificar que el producto final NO sea ya una receta
    if producto_final.es_receta:
        return jsonify({"error": f"El producto '{producto_final.nombre}' (ID: {producto_final_id}) ya tiene una receta asociada"}), 409

    items_db, total_porcentaje, error_response = validar_items_receta(items_payload, producto_final_id)
    if error_response:
        return error_response

    if not items_db:
        return jsonify({"error": "La lista 'items' no puede estar vacía al crear una receta"}), 400
    if abs(total_porcentaje - Decimal(100)) > Decimal('0.01'):
        return jsonify({"error": f"La suma de porcentajes ({total_porcentaje}%) debe ser 100% al crear"}), 400

    try:
        nueva_receta = Receta(producto_final_id=producto_final_id)
        nueva_receta.items = items_db

        producto_final.es_receta = True
        producto_final.fecha_actualizacion_costo = datetime.datetime.utcnow()

        db.session.add(nueva_receta)
        db.session.add(producto_final)

        try:
            db.session.flush()

            costo_calculado = calcular_costo_producto(producto_final_id)
            if costo_calculado is not None:
                producto_final.costo_referencia_usd = costo_calculado
            else:
                producto_final.costo_referencia_usd = None

            db.session.add(producto_final)
            db.session.commit()

        except Exception as calculo_commit_err:
            db.session.rollback()
            print(f"--- ERROR [crear_receta]: Fallo durante flush/cálculo/commit de costo inicial para receta de producto {producto_final_id}: {calculo_commit_err}")
            traceback.print_exc()
            return jsonify({"error": "Error al calcular o guardar el costo inicial de la receta"}), 500

        return jsonify(receta_a_dict(nueva_receta)), 201

    except Exception as e:
        db.session.rollback()
        print(f"Error EXCEPCION creando receta para producto {producto_final_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al crear la receta"}), 500


@recetas_bp.route('/obtener/por-producto/<int:producto_final_id>', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'])
def obtener_receta_por_producto(current_user, producto_final_id):
    receta = Receta.query.filter_by(producto_final_id=producto_final_id).first()
    if not receta:
        return jsonify({"error": f"No existe receta para el producto con ID {producto_final_id}"}), 404
    return jsonify(receta_a_dict(receta))


@recetas_bp.route('/actualizar/por-producto/<int:producto_final_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN'])
def actualizar_receta_por_producto(current_user, producto_final_id):
    receta = Receta.query.filter_by(producto_final_id=producto_final_id).first()
    if not receta:
        return jsonify({"error": f"No existe receta para el producto con ID {producto_final_id}"}), 404

    data = request.get_json()
    if not data or 'items' not in data:
        return jsonify({"error": "Falta la lista 'items' en el payload"}), 400

    items_payload = data['items']
    producto_final = receta.producto_final

    if not producto_final:
        print(f"ERROR CRITICO [actualizar_receta]: Receta para producto {producto_final_id} no tiene producto final asociado!")
        return jsonify({"error": "Error interno: Inconsistencia de datos de receta."}), 500

    nuevos_items_db, total_porcentaje, error_response = validar_items_receta(items_payload, producto_final_id)
    if error_response:
        return error_response

    if nuevos_items_db and abs(total_porcentaje - Decimal(100)) > Decimal('0.01'):
        return jsonify({"error": f"La suma de porcentajes ({total_porcentaje}%) debe ser 100%"}), 400

    try:
        receta.items = nuevos_items_db
        receta.fecha_modificacion = datetime.datetime.utcnow()

        try:
            db.session.flush()
            costo_calculado = calcular_costo_producto(producto_final_id)
            if costo_calculado is not None:
                producto_final.costo_referencia_usd = costo_calculado
            else:
                producto_final.costo_referencia_usd = None

            producto_final.fecha_actualizacion_costo = datetime.datetime.utcnow()
            db.session.add(producto_final)
            db.session.commit()

        except Exception as calculo_commit_err:
            db.session.rollback()
            print(f"--- ERROR [actualizar_receta]: Fallo durante flush/cálculo/commit de costo tras actualizar receta para producto {producto_final_id}: {calculo_commit_err}")
            traceback.print_exc()
            return jsonify({"error": "Error al recalcular o guardar el costo tras actualizar la receta"}), 500

        return jsonify(receta_a_dict(receta))

    except Exception as e:
        db.session.rollback()
        print(f"Error EXCEPCION actualizando receta para producto {producto_final_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al actualizar la receta"}), 500


@recetas_bp.route('/eliminar/por-producto/<int:producto_final_id>', methods=['DELETE'])
@token_required
@roles_required(ROLES['ADMIN'])
def eliminar_receta_por_producto(current_user, producto_final_id):
    receta = Receta.query.filter_by(producto_final_id=producto_final_id).first()
    if not receta:
        return jsonify({"error": f"No existe receta para el producto con ID {producto_final_id}"}), 404

    producto_final = receta.producto_final

    try:
        if producto_final:
            print(f"--- INFO [eliminar_receta]: Desmarcando producto {producto_final.id} ('{producto_final.nombre}') como receta.")
            producto_final.es_receta = False
            producto_final.costo_referencia_usd = None
            producto_final.fecha_actualizacion_costo = datetime.datetime.utcnow()
            db.session.add(producto_final)

        print(f"--- INFO [eliminar_receta]: Eliminando receta para producto {producto_final_id} de la base de datos.")
        db.session.delete(receta)
        db.session.commit()
        print(f"--- INFO [eliminar_receta]: Commit exitoso.")

        pf_info = f"'{producto_final.nombre}' (ID: {producto_final.id})" if producto_final else f"producto ID {producto_final_id}"
        return jsonify({"message": f"Receta para el producto {pf_info} eliminada correctamente"}), 200

    except Exception as e:
        db.session.rollback()
        print(f"--- ERROR [eliminar_receta]: Error EXCEPCION eliminando receta para producto {producto_final_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al eliminar la receta"}), 500
