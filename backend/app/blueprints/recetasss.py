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
    items_payload = data.get('items') # Obtener items aquí

    # Validar ID del producto final antes de la consulta
    if not isinstance(producto_final_id, int):
         return jsonify({"error": "'producto_final_id' debe ser un número entero"}), 400

    # Buscar producto final
    producto_final = db.session.get(Producto, producto_final_id)
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
        nueva_receta.items = items_db  # SQLAlchemy manejará la asociación

        # Marcar el producto final como receta
        producto_final.es_receta = True
        producto_final.fecha_actualizacion_costo = datetime.datetime.utcnow()  # Forzar actualización de fecha

        db.session.add(nueva_receta)
        # producto_final ya está en la sesión por el query.get, pero add() es idempotente
        db.session.add(producto_final)

        # Usar try/finally para asegurar rollback si el cálculo/commit falla
        try:
            # Flush para asegurar que las relaciones existen en sesión antes del cálculo
            print(f"--- INFO [crear_receta]: Haciendo flush de sesión antes de calcular costo para producto {producto_final_id}...")
            db.session.flush()

            # Asignar el ID de la receta a `receta_id` del `producto_final` antes de calcular el costo
            producto_final.receta = nueva_receta  # Asignar el ID de la receta a producto_final

            # Calcular costo inicial
            print(f"--- INFO [crear_receta]: Calculando costo inicial para nueva receta de producto {producto_final_id}...")
            costo_calculado = calcular_costo_producto(producto_final_id)  # Llama a la función importada

            if costo_calculado is not None:
                print(f"---   Costo inicial calculado para {producto_final_id}: {costo_calculado}")
                producto_final.costo_referencia_usd = costo_calculado
            else:
                print(f"---   WARNING [crear_receta]: No se pudo calcular costo inicial para receta {producto_final_id}. Costo se dejará en None.")
                producto_final.costo_referencia_usd = None  # Asegurar que es None

            # Volver a añadir producto_final por si cambió el costo
            db.session.add(producto_final)

            # Commit final
            print(f"--- INFO [crear_receta]: Haciendo commit final para receta y costo calculado de {producto_final_id}...")
            db.session.commit()

            # Ahora, ya tienes el ID de la receta en `producto_final.receta_id`
            print(f"--- INFO [crear_receta]: ID de la nueva receta asignado a producto_final: {producto_final.receta}")

            print(f"--- INFO [crear_receta]: Commit exitoso.")

        except Exception as calculo_commit_err:
            db.session.rollback()  # Falló cálculo o commit final
            print(f"--- ERROR [crear_receta]: Fallo durante flush/cálculo/commit de costo inicial para receta {producto_final_id}: {calculo_commit_err}")
            traceback.print_exc()
            # Informar que la receta pudo no haberse guardado completamente o el costo falló
            return jsonify({"error": "Error al calcular o guardar el costo inicial de la receta"}), 500

        # Usar la instancia actual debería ser seguro aquí para la serialización
        return jsonify(receta_a_dict(nueva_receta)), 201

    except Exception as e:
        db.session.rollback()
        print(f"Error EXCEPCION creando receta para producto {producto_final_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al crear la receta"}), 500




@recetas_bp.route('/obtener/<int:receta_id>', methods=['GET'])
@token_required
# @roles_required(ROLES['USER']) # Decidir quién puede ver recetas
@roles_required(ROLES['ADMIN'])
def obtener_receta(current_user, receta_id):
    # Usar options para cargar relaciones eficientemente si es necesario
    # from sqlalchemy.orm import joinedload
    # receta = Receta.query.options(
    #     joinedload(Receta.producto_final),
    #     joinedload(Receta.items).joinedload(RecetaItem.ingrediente)
    # ).get_or_404(receta_id)
    receta = Receta.query.get_or_404(receta_id) # Versión simple
    return jsonify(receta_a_dict(receta))


@recetas_bp.route('/actualizar/<int:receta_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN'])
def actualizar_receta(current_user, receta_id):
    receta = Receta.query.get_or_404(receta_id)
    data = request.get_json()

    # En PUT, usualmente se espera el recurso completo o los campos a cambiar.
    # Aquí esperamos solo 'items' para modificar la composición.
    if not data or 'items' not in data:
        return jsonify({"error": "Falta la lista 'items' en el payload"}), 400

    items_payload = data['items']
    producto_final_id = receta.producto_final_id # El producto final no cambia
    producto_final = receta.producto_final # Necesario para actualizar su costo

    if not producto_final:
         # Esto sería un estado inconsistente de la BD
         print(f"ERROR CRITICO [actualizar_receta]: Receta {receta_id} no tiene producto final asociado!")
         return jsonify({"error": "Error interno: Inconsistencia de datos de receta."}), 500

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

        # Usar try/finally para asegurar rollback si cálculo/commit falla
        try:
            # Flush para aplicar cambio de items antes de calcular
            print(f"--- INFO [actualizar_receta]: Haciendo flush de sesión antes de recalcular costo para receta {receta_id}...")
            db.session.flush()

            # Recalcular costo del producto final
            print(f"--- INFO [actualizar_receta]: Recalculando costo para receta {receta_id} (producto {producto_final_id}) tras actualización...")
            costo_calculado = calcular_costo_producto(producto_final_id) # Llama a la función importada

            if costo_calculado is not None:
                print(f"---   Nuevo costo calculado para {producto_final_id}: {costo_calculado}")
                producto_final.costo_referencia_usd = costo_calculado
            else:
                print(f"---   WARNING [actualizar_receta]: No se pudo recalcular costo para receta {receta_id}. Costo se dejará en None.")
                producto_final.costo_referencia_usd = None

            # Actualizar fecha del producto SIEMPRE que se modifica la receta
            producto_final.fecha_actualizacion_costo = datetime.datetime.utcnow()
            db.session.add(producto_final) # Añadir para guardar cambios en producto

            # Commit final
            print(f"--- INFO [actualizar_receta]: Haciendo commit final para receta {receta_id} y costo recalculado...")
            db.session.commit()
            print(f"--- INFO [actualizar_receta]: Commit exitoso.")

        except Exception as calculo_commit_err:
            db.session.rollback()
            print(f"--- ERROR [actualizar_receta]: Fallo durante flush/cálculo/commit de costo tras actualizar receta {receta_id}: {calculo_commit_err}")
            traceback.print_exc()
            return jsonify({"error": "Error al recalcular o guardar el costo tras actualizar la receta"}), 500

        # Usar instancia actual debería ser seguro
        return jsonify(receta_a_dict(receta))

    except Exception as e:
        db.session.rollback()
        print(f"Error EXCEPCION actualizando receta {receta_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al actualizar la receta"}), 500


@recetas_bp.route('/eliminar/<int:receta_id>', methods=['DELETE'])
@token_required
@roles_required(ROLES['ADMIN'])
def eliminar_receta(current_user, receta_id):
    """Elimina una receta y desmarca el producto asociado como receta."""
    receta = Receta.query.get_or_404(receta_id, description=f"Receta con ID {receta_id} no encontrada.")
    producto_final = receta.producto_final # Guardar referencia

    try:
        if producto_final:
            print(f"--- INFO [eliminar_receta]: Desmarcando producto {producto_final.id} ('{producto_final.nombre}') como receta.")
            producto_final.es_receta = False
            # Al eliminar la receta, el producto ya no tiene costo derivado. Poner a None.
            producto_final.costo_referencia_usd = None
            producto_final.fecha_actualizacion_costo = datetime.datetime.utcnow()
            db.session.add(producto_final)

        # Borrar la receta (cascade debería borrar RecetaItems)
        print(f"--- INFO [eliminar_receta]: Eliminando receta {receta_id} de la base de datos.")
        db.session.delete(receta)
        db.session.commit()
        print(f"--- INFO [eliminar_receta]: Commit exitoso.")

        pf_info = f"'{producto_final.nombre}' (ID: {producto_final.id})" if producto_final else f"producto ID {receta.producto_final_id}"
        return jsonify({"message": f"Receta para el producto {pf_info} eliminada correctamente"}), 200 # 200 OK

    except Exception as e:
        db.session.rollback()
        print(f"--- ERROR [eliminar_receta]: Error EXCEPCION eliminando receta {receta_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al eliminar la receta"}), 500



@recetas_bp.route('/actualizar-costos-recetas', methods=['POST'])
def actualizar_costos_recetas():
    """
    Endpoint para recalcular y actualizar el costo_referencia_usd de todos los
    productos marcados como 'es_receta'.
    
    Este es un proceso que puede consumir recursos, por lo que se recomienda
    ejecutarlo en momentos de baja carga o como una tarea programada.
    
    Responde con un JSON que resume el resultado de la operación.
    """
    try:
        # 1. Obtener todos los productos que son recetas
        productos_receta = Producto.query.filter_by(es_receta=True).all()
        
        if not productos_receta:
            return jsonify({
                "mensaje": "No se encontraron productos marcados como recetas para actualizar."
            }), 200

        # 2. Inicializar contadores y listas para el reporte final
        actualizados = 0
        fallidos = 0
        detalles_fallidos = []

        # 3. Iterar sobre cada producto y calcular su costo
        for producto in productos_receta:
            # La función calcular_costo_producto inicializa su propio set 'visitados'
            # en cada llamada de alto nivel, lo cual es correcto para este bucle.
            nuevo_costo = calcular_costo_producto(producto.id)

            if nuevo_costo is not None:
                # Si el costo se calculó correctamente, lo actualizamos
                producto.costo_referencia_usd = nuevo_costo
                actualizados += 1
                print(f"ÉXITO: Producto ID {producto.id} ('{producto.nombre}') actualizado a costo {nuevo_costo}")
            else:
                # Si hubo un error (ciclo, falta de costo base, etc.), lo registramos
                fallidos += 1
                detalles_fallidos.append({
                    "id": producto.id,
                    "nombre": producto.nombre,
                    "motivo": "No se pudo calcular el costo (revisar logs para detalles como ciclos o falta de costo base en ingredientes)."
                })
                print(f"FALLO: No se pudo calcular el costo para el Producto ID {producto.id} ('{producto.nombre}')")

        # 4. Confirmar todos los cambios en la base de datos de una sola vez
        db.session.commit()

        # 5. Preparar y devolver una respuesta clara
        respuesta = {
            "mensaje": "Operación de actualización de costos completada.",
            "total_recetas_procesadas": len(productos_receta),
            "actualizados_exitosamente": actualizados,
            "fallidos": fallidos,
            "detalles_fallidos": detalles_fallidos
        }
        
        return jsonify(respuesta), 200

    except Exception as e:
        # En caso de un error inesperado (ej. fallo de conexión a la BD),
        # revertimos la transacción para no dejar datos a medio actualizar.
        db.session.rollback()
        # Es buena práctica loguear el error completo en el servidor
        print(f"ERROR CRÍTICO en actualizar_costos_recetas: {e}")
        return jsonify({
            "error": "Ocurrió un error inesperado durante el proceso.",
            "detalle": str(e)
        }), 500
    


@recetas_bp.route('/test-recetas', methods=['GET'])
def test_blueprint_recetas():
    return jsonify({"mensaje": "El blueprint de recetas está funcionando!"})