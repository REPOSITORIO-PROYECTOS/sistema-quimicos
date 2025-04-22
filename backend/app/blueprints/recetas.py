# blueprints/recetas.py
from flask import Blueprint, request, jsonify
# Asegúrate que la ruta relativa ..models sea correcta para tu estructura
from ..models import db, Producto, Receta, RecetaItem
from decimal import Decimal, InvalidOperation
import traceback
import datetime # <-- Añadido
from .. import db

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

    for item_data in items_payload:
        ingrediente_id = item_data.get('ingrediente_id')
        porcentaje_payload = item_data.get('porcentaje') # Obtener directo

        if ingrediente_id is None or porcentaje_payload is None: # Chequear None explícitamente
            return None, None, (jsonify({"error": "Falta 'ingrediente_id' o 'porcentaje' en un item"}), 400)

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

        ingrediente = Producto.query.get(ingrediente_id)
        if not ingrediente:
            return None, None, (jsonify({"error": f"Ingrediente ID {ingrediente_id} no encontrado"}), 404) # 404 Not Found es más apropiado

        if ingrediente_id == producto_final_id:
            return None, None, (jsonify({"error": "Un producto no puede ser ingrediente de su propia receta"}), 400)

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
def crear_receta():
    data = request.get_json()
    if not data or 'producto_final_id' not in data or 'items' not in data:
        return jsonify({"error": "Faltan datos requeridos: 'producto_final_id' y 'items'"}), 400

    producto_final_id = data.get('producto_final_id')
    items_payload = data.get('items') # Obtener items aquí

    # Validar ID del producto final antes de la consulta
    if not isinstance(producto_final_id, int):
         return jsonify({"error": "'producto_final_id' debe ser un número entero"}), 400

    # Buscar producto final
    producto_final = Producto.query.get(producto_final_id)
    if not producto_final:
        return jsonify({"error": f"Producto final con ID {producto_final_id} no existe"}), 404

    # Verificar que el producto final NO sea ya una receta
    if producto_final.es_receta: # Simplificado
        return jsonify({"error": f"El producto '{producto_final.nombre}' (ID: {producto_final_id}) ya tiene una receta asociada"}), 409 # 409 Conflict

    # Validar items usando la función helper
    items_db, total_porcentaje, error_response = validar_items_receta(items_payload, producto_final_id)
    if error_response:
        return error_response # Retorna la tupla (jsonify, status_code)

    # --- Validación específica de creación ---
    if not items_db:
        return jsonify({"error": "La lista 'items' no puede estar vacía al crear una receta"}), 400
    if abs(total_porcentaje - Decimal(100)) > Decimal('0.01'): # Re-chequear suma para creación
        return jsonify({"error": f"La suma de porcentajes ({total_porcentaje}%) debe ser 100% al crear"}), 400


    try:
        # Crear receta y asociar items (items_db ya contiene objetos RecetaItem)
        nueva_receta = Receta(producto_final_id=producto_final_id)
        nueva_receta.items = items_db # SQLAlchemy manejará la asociación

        # Marcar el producto final como receta
        producto_final.es_receta = True
        # Anular costo directo, se calculará basado en ingredientes
        producto_final.costo_referencia_usd = None
        producto_final.fecha_actualizacion_costo = datetime.datetime.utcnow() # Forzar actualización fecha

        db.session.add(nueva_receta)
        # producto_final ya está en la sesión por el query.get, pero add() es idempotente
        db.session.add(producto_final)
        db.session.commit()

        return jsonify(receta_a_dict(nueva_receta)), 201

    except Exception as e:
        db.session.rollback()
        print(f"Error EXCEPCION creando receta para producto {producto_final_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al crear la receta"}), 500


@recetas_bp.route('/obtener/<int:receta_id>', methods=['GET'])
def obtener_receta(receta_id):
    # Usar options para cargar relaciones eficientemente si es necesario
    # from sqlalchemy.orm import joinedload
    # receta = Receta.query.options(
    #     joinedload(Receta.producto_final),
    #     joinedload(Receta.items).joinedload(RecetaItem.ingrediente)
    # ).get_or_404(receta_id)
    receta = Receta.query.get_or_404(receta_id) # Versión simple
    return jsonify(receta_a_dict(receta))


@recetas_bp.route('/actualizar/<int:receta_id>', methods=['PUT'])
def actualizar_receta(receta_id):
    receta = Receta.query.get_or_404(receta_id)
    data = request.get_json()

    # En PUT, usualmente se espera el recurso completo o los campos a cambiar.
    # Aquí esperamos solo 'items' para modificar la composición.
    if not data or 'items' not in data:
        return jsonify({"error": "Falta la lista 'items' en el payload"}), 400

    items_payload = data['items']
    producto_final_id = receta.producto_final_id # El producto final no cambia

    # Validar items usando la función helper
    nuevos_items_db, total_porcentaje, error_response = validar_items_receta(items_payload, producto_final_id)
    if error_response:
        return error_response

    # En actualización, permitir lista vacía podría significar "borrar todos los ingredientes"
    # Si se permiten items vacíos, la suma de porcentajes es 0, lo cual es correcto.
    # Si no se permiten vacíos en PUT, añadir check:
    # if not nuevos_items_db:
    #    return jsonify({"error": "La lista 'items' no puede estar vacía al actualizar"}), 400
    # Re-validar suma 100% si hay items
    if nuevos_items_db and abs(total_porcentaje - Decimal(100)) > Decimal('0.01'):
         return jsonify({"error": f"La suma de porcentajes ({total_porcentaje}%) debe ser 100%"}), 400


    try:
        # Reemplazar items existentes.
        # Si Receta.items tiene cascade="all, delete-orphan", SQLAlchemy borrará los viejos.
        receta.items = nuevos_items_db
        receta.fecha_modificacion = datetime.datetime.utcnow()

        # Actualizar fecha del producto padre también, ya que su costo derivado cambió
        if receta.producto_final:
            # producto_final ya está cargado en la sesión a través de 'receta'
            receta.producto_final.fecha_actualizacion_costo = datetime.datetime.utcnow()
            # No necesitas db.session.add(receta.producto_final) si ya está en sesión

        # db.session.add(receta) # No es necesario si 'receta' ya viene de la sesión
        db.session.commit()
        return jsonify(receta_a_dict(receta)) # Devolver la receta actualizada

    except Exception as e:
        db.session.rollback()
        print(f"Error EXCEPCION actualizando receta {receta_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al actualizar la receta"}), 500


@recetas_bp.route('/eliminar/<int:receta_id>', methods=['DELETE'])
def eliminar_receta(receta_id):
    # get_or_404 maneja el caso de que la receta no exista
    receta = Receta.query.get_or_404(receta_id)
    # Guardar referencia al producto final ANTES de borrar la receta
    producto_final = receta.producto_final

    try:
        # Si la receta tenía un producto asociado...
        if producto_final:
            # Marcar que el producto YA NO es una receta
            producto_final.es_receta = False
            # Decidir qué hacer con el costo. None indica que no tiene costo base ni derivado.
            # O podrías poner Decimal(0) o requerir que se actualice manualmente.
            producto_final.costo_referencia_usd = None
            producto_final.fecha_actualizacion_costo = datetime.datetime.utcnow()
            db.session.add(producto_final) # Añadir el producto modificado a la sesión

        # Borrar la receta. Si hay cascade, los RecetaItem se borrarán también.
        db.session.delete(receta)
        db.session.commit()

        # Mensaje de éxito
        pf_nombre = producto_final.nombre if producto_final else f"ID {receta.producto_final_id}"
        return jsonify({"message": f"Receta para el producto '{pf_nombre}' eliminada correctamente"}), 200 # 200 OK o 204 No Content

    except Exception as e:
        db.session.rollback()
        print(f"Error EXCEPCION eliminando receta {receta_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al eliminar la receta"}), 500