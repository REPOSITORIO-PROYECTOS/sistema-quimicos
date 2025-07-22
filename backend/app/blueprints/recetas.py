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

    items_db = []
    total_porcentaje = Decimal(0)
    ids_ingredientes = set()

    for item_data in items_payload:
        ingrediente_id = item_data.get('ingrediente_id')
        porcentaje_payload = item_data.get('porcentaje')

        if ingrediente_id is None or porcentaje_payload is None:
            return None, None, (jsonify({"error": "Falta 'ingrediente_id' o 'porcentaje' en un item"}), 400)

        if not isinstance(ingrediente_id, int):
             return None, None, (jsonify({"error": f"Valor de 'ingrediente_id' ({ingrediente_id}) inválido"}), 400)

        try:
            porcentaje = Decimal(str(porcentaje_payload))
            if porcentaje <= 0: raise ValueError()
        except (ValueError, InvalidOperation):
             return None, None, (jsonify({"error": f"Porcentaje '{porcentaje_payload}' inválido para ingrediente ID {ingrediente_id}"}), 400)

        ingrediente = db.session.get(Producto, ingrediente_id)
        if not ingrediente:
            return None, None, (jsonify({"error": f"Ingrediente ID {ingrediente_id} no encontrado"}), 404)

        if ingrediente_id == producto_final_id:
            return None, None, (jsonify({"error": "Un producto no puede ser ingrediente de su propia receta"}), 400)
        
        if ingrediente_id in ids_ingredientes:
            return None, None, (jsonify({"error": f"El ingrediente ID {ingrediente_id} está duplicado"}), 400)
        ids_ingredientes.add(ingrediente_id)

        items_db.append(RecetaItem(ingrediente_id=ingrediente_id, porcentaje=porcentaje))
        total_porcentaje += porcentaje

    # Validación de la suma de porcentajes
    # Se aplica tanto si la lista de items viene llena como si viene vacía (total=0)
    # Excepción: si se permite una lista vacía, la suma de 100 no es requerida.
  

    # --- CORRECCIÓN CLAVE ---
    # Devolvemos los 3 valores que la definición de la función espera.
    return items_db, total_porcentaje, None # Éxito


# --- Endpoints ---

@recetas_bp.route('/crear', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'])
def crear_receta(current_user):
    # ... (toda tu lógica de validación inicial se mantiene igual) ...
    data = request.get_json()
    # ...
    producto_final_id = data.get('producto_final_id')
    items_payload = data.get('items')
    # ...
    producto_final = db.session.get(Producto, producto_final_id)
    # ... (validaciones de producto y receta existente) ...
    
    items_db, total_porcentaje, error_info = validar_items_receta(items_payload, producto_final_id)
    
    if error_info:
        return error_info[0], error_info[1]

    if not items_db:
        return jsonify({"error": "La lista 'items' no puede estar vacía al crear una receta"}), 400

   
    try:
        # 1. PREPARAR OBJETOS EN MEMORIA
        nueva_receta = Receta(producto_final_id=producto_final_id)
        nueva_receta.items = items_db
        db.session.add(nueva_receta)

        producto_final.es_receta = True
        producto_final.costo_manual_override = False

        # 2. FLUSH: Escribir la nueva receta y sus ítems en la DB
        # Esto es vital para que la siguiente función los pueda encontrar.
        db.session.flush()

        # 3. EXPIRE (Opcional pero recomendado para consistencia):
        # Invalidar el estado en memoria para forzar una re-lectura si fuera necesario.
        db.session.expire(producto_final)
        db.session.expire(nueva_receta)

        # 4. CALCULAR: Ahora el cálculo funcionará correctamente
        # porque la receta y sus items ya existen en la base de datos.
        costo_calculado = calcular_costo_producto(producto_final_id)

        if costo_calculado is not None:
            producto_final.costo_referencia_usd = costo_calculado
            producto_final.fecha_actualizacion_costo = datetime.datetime.utcnow()
        else:
            # Si el cálculo falla, limpiamos el costo para evitar datos incorrectos
            producto_final.costo_referencia_usd = None
            print(f"WARN: El costo calculado para el nuevo producto {producto_final_id} fue None. Se guardó sin costo.")

        # 5. COMMIT: Confirmar toda la transacción
        db.session.commit()

        return jsonify(receta_a_dict(nueva_receta)), 201

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": "Error interno al crear la receta"}), 500


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
        return jsonify({"error": f"No existe receta para el producto ID {producto_final_id}"}), 404

    data = request.get_json()
    items_payload = data.get('items')
    # ... (validaciones de payload) ...
    
    nuevos_items_db, total_porcentaje, error_info = validar_items_receta(items_payload, producto_final_id)
    
    if error_info:
        return error_info[0], error_info[1]

    try:
        # 1. Actualizar la receta en la sesión
        receta.items = nuevos_items_db
        receta.fecha_modificacion = datetime.datetime.utcnow()
        
        # 2. FLUSH: Escribir los cambios en los ítems en la DB
        db.session.flush()

        # 3. EXPIRE: ¡EL PASO CLAVE!
        # Le decimos a SQLAlchemy que el estado del objeto 'receta' en memoria
        # está obsoleto. La próxima vez que se acceda a un atributo (como .items),
        # se volverá a consultar desde la base de datos.
        db.session.expire(receta)
        
        # Opcionalmente, para ser más explícito, puedes expirar también el producto.
        db.session.expire(receta.producto_final)

        # 4. CALCULAR: Ahora el cálculo usará los datos frescos
        producto_a_actualizar = receta.producto_final
        costo_calculado = calcular_costo_producto(producto_a_actualizar.id)
        print("COSTO CALCULADO POR ACTUALIZAR ESSSSSSSS" +str(costo_calculado))
        if costo_calculado is not None:
             producto_a_actualizar.costo_referencia_usd = costo_calculado
             producto_a_actualizar.fecha_actualizacion_costo = datetime.datetime.utcnow()
        else:
             print(f"WARN: El costo calculado para {producto_a_actualizar.id} fue None. No se actualizó el costo.")

        # 5. COMMIT: Confirmar todo
        db.session.commit()

        return jsonify(receta_a_dict(receta))

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": "Error interno al actualizar la receta"}), 500
    

@recetas_bp.route('/eliminar/por-producto/<int:producto_final_id>', methods=['DELETE'])
@token_required
@roles_required(ROLES['ADMIN'])
def eliminar_receta_por_producto(current_user, producto_final_id):
    """
    Elimina una receta y revierte el producto a un producto simple.
    El frontend debe advertir al usuario que deberá establecer un nuevo
    costo base para el producto, ya que el de la receta ya no es válido.
    """
    receta = Receta.query.filter_by(producto_final_id=producto_final_id).first()
    if not receta:
        return jsonify({"error": f"No existe receta para el producto ID {producto_final_id}"}), 404

    producto_final = receta.producto_final

    try:
        # Revertir el producto a un estado "simple"
        if producto_final:
            producto_final.es_receta = False
            producto_final.costo_manual_override = False
            # Es importante limpiar el costo. El producto ahora no tiene un costo definido.
            producto_final.costo_referencia_usd = None 
            producto_final.fecha_actualizacion_costo = datetime.datetime.utcnow()

        # Eliminar la receta (los items se borran en cascada si está bien configurado el modelo)
        db.session.delete(receta)
        
        db.session.commit()

        pf_info = f"'{producto_final.nombre}' (ID: {producto_final.id})" if producto_final else f"producto ID {producto_final_id}"
        return jsonify({"message": f"Receta para el producto {pf_info} eliminada. El producto ya no es una receta y su costo debe ser reestablecido."}), 200

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": "Error interno al eliminar la receta"}), 500

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