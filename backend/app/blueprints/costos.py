# blueprints/costos.py
from flask import Blueprint, request, jsonify
from decimal import Decimal, InvalidOperation
import traceback
import datetime
from ..models import db, Producto
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES
from ..utils.costos_utils import calcular_costo_producto, redondear_decimal
from .recetas import receta_a_dict # Podríamos necesitarla si devolvemos info de receta


def propagar_actualizacion_costo(producto_id_actualizado: int, db_session):
    """
    Encuentra todos los productos receta que usan el producto_id_actualizado
    como ingrediente y recalcula sus costos, propagando el cambio hacia arriba.
    """
    # Usar una cola o stack para búsqueda (BFS o DFS)
    productos_a_recalcular = set()
    cola_busqueda = [producto_id_actualizado] # Empezar con el producto que cambió

    # Para evitar recalcular lo mismo múltiples veces en una sola propagación
    ya_procesados_en_esta_ola = set()

    while cola_busqueda:
        id_ingrediente = cola_busqueda.pop(0) # BFS (o pop() para DFS)

        if id_ingrediente in ya_procesados_en_esta_ola:
            continue
        ya_procesados_en_esta_ola.add(id_ingrediente)

        # Buscar todas las recetas donde este ID es un ingrediente
        from ..models import RecetaItem # Import local para evitar ciclos si está en utils
        items_afectados = db_session.query(RecetaItem).filter(RecetaItem.ingrediente_id == id_ingrediente).all()

        for item in items_afectados:
            if item.receta and item.receta.producto_final:
                producto_padre_id = item.receta.producto_final_id
                if producto_padre_id not in productos_a_recalcular:
                     productos_a_recalcular.add(producto_padre_id)
                     # Añadir el padre a la cola para propagar MÁS ARRIBA si este también es ingrediente
                     cola_busqueda.append(producto_padre_id)

    print(f"--- INFO [propagar_actualizacion_costo]: Propagación desde {producto_id_actualizado}. Productos a recalcular: {productos_a_recalcular}")

    # Ahora recalcular todos los productos afectados que encontramos
    for prod_id in productos_a_recalcular:
        producto_a_actualizar = db_session.get(Producto, prod_id)
        if producto_a_actualizar and producto_a_actualizar.es_receta:
            print(f"--- Recalculando costo para producto receta ID {prod_id}...")
            nuevo_costo_calculado = calcular_costo_producto(prod_id) # Recalcular

            if nuevo_costo_calculado is not None:
                 # Solo actualizar si el costo calculado no es None y es diferente al actual
                 costo_actual = producto_a_actualizar.costo_referencia_usd
                 # Comparar redondeado vs redondeado por si acaso
                 if costo_actual is None or redondear_decimal(costo_actual) != nuevo_costo_calculado:
                     print(f"---   Actualizando costo de {prod_id} de {costo_actual} a {nuevo_costo_calculado}")
                     producto_a_actualizar.costo_referencia_usd = nuevo_costo_calculado
                     producto_a_actualizar.fecha_actualizacion_costo = datetime.datetime.utcnow()
                     db_session.add(producto_a_actualizar) # Marcar para guardar
                 else:
                      print(f"---   Costo de {prod_id} no cambió ({nuevo_costo_calculado}). No se actualiza.")
            else:
                 # Si el nuevo costo es None (ej. porque ahora falta un sub-ingrediente)
                 # podrías querer poner el costo del producto a None también.
                 if producto_a_actualizar.costo_referencia_usd is not None:
                     print(f"---   ERROR calculando nuevo costo para {prod_id}. Se pondrá a None.")
                     producto_a_actualizar.costo_referencia_usd = None
                     producto_a_actualizar.fecha_actualizacion_costo = datetime.datetime.utcnow()
                     db_session.add(producto_a_actualizar) # Marcar para guardar


# --- Blueprint ---
costos_bp = Blueprint('costos', __name__, url_prefix='/costos')

# --- Endpoints ---

@costos_bp.route('/producto/<int:producto_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN']) # O un rol específico 'GESTOR_COMPRAS' o 'GESTOR_COSTOS'
def actualizar_costo_base_producto(current_user, producto_id):
    """
    Actualiza el costo base (costo_referencia_usd) de un producto
    que NO es una receta (ej. materia prima).
    Desencadena la propagación de costos a las recetas que lo usan.
    """
    producto = db.session.get(Producto, producto_id)
    if not producto:
        return jsonify({"error": f"Producto con ID {producto_id} no encontrado"}), 404

    if producto.es_receta:
        return jsonify({"error": f"El producto ID {producto_id} ('{producto.nombre}') es una receta. Su costo se calcula, no se fija manualmente. Use los endpoints de recetas."}), 400

    data = request.get_json()
    if not data or 'nuevo_costo' not in data:
        return jsonify({"error": "Falta el campo 'nuevo_costo' en el payload"}), 400

    nuevo_costo_str = str(data['nuevo_costo']).strip()
    try:
        nuevo_costo = Decimal(nuevo_costo_str)
        if nuevo_costo < 0:
            raise ValueError("El costo no puede ser negativo")
        # Redondear el costo base también por consistencia
        nuevo_costo = redondear_decimal(nuevo_costo)
    except (InvalidOperation, ValueError) as e:
        return jsonify({"error": f"Valor de 'nuevo_costo' inválido: {e}"}), 400

    try:
        costo_anterior = producto.costo_referencia_usd
        producto.costo_referencia_usd = nuevo_costo
        producto.fecha_actualizacion_costo = datetime.datetime.utcnow()
        db.session.add(producto) # Marcar para guardar

        print(f"--- INFO [actualizar_costo_base]: Costo base de producto {producto_id} ('{producto.nombre}') actualizado de {costo_anterior} a {nuevo_costo}.")

        # --- ¡PROPAGACIÓN! ---
        # Solo propagar si el costo realmente cambió
        if costo_anterior is None or redondear_decimal(costo_anterior) != nuevo_costo:
             print(f"--- Iniciando propagación de costo desde producto {producto_id}...")
             propagar_actualizacion_costo(producto_id, db.session)
        else:
             print(f"--- Costo base de producto {producto_id} no cambió. No se propaga.")


        db.session.commit() # Guardar el costo base y TODOS los costos propagados

        return jsonify({
            "message": f"Costo base del producto '{producto.nombre}' (ID: {producto_id}) actualizado a {nuevo_costo}. Propagación iniciada.",
            "producto_id": producto.id,
            "nuevo_costo_base": float(nuevo_costo) # Convertir a float para JSON
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error EXCEPCION actualizando costo base para producto {producto_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al actualizar el costo base"}), 500


@costos_bp.route('/producto/<int:producto_id>', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN']) # O mantenerlo restringido
def obtener_costo_producto(current_user, producto_id):
    """
    Obtiene el costo actual almacenado para un producto.
    Si es receta, devuelve el último costo calculado.
    Si es base, devuelve el costo fijado.
    Puede devolver null si el costo no está definido o no se pudo calcular.
    """
    producto = db.session.get(Producto, producto_id)
    if not producto:
        return jsonify({"error": f"Producto con ID {producto_id} no encontrado"}), 404

    costo_actual = producto.costo_referencia_usd
    fecha_actualizacion = producto.fecha_actualizacion_costo


    return jsonify({
        "producto_id": producto.id,
        "codigo_interno": producto.codigo_interno,
        "nombre": producto.nombre,
        "es_receta": producto.es_receta,
        "costo_referencia_usd": float(costo_actual) if costo_actual is not None else None,
        "fecha_actualizacion_costo": fecha_actualizacion.isoformat() if fecha_actualizacion else None,
        "costo_definido": costo_actual is not None # Flag útil para el frontend
    }), 200

# --- Endpoint Opcional para Recalcular Manualmente ---
@costos_bp.route('/recalcular/producto/<int:producto_id>', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'])
def recalcular_costo_producto_endpoint(current_user, producto_id):
    """
    Fuerza el recálculo del costo para un producto (útil si es receta).
    Actualiza el costo almacenado en la BD. No propaga hacia arriba por defecto.
    """
    producto = db.session.get(Producto, producto_id)
    if not producto:
        return jsonify({"error": f"Producto con ID {producto_id} no encontrado"}), 404

    if not producto.es_receta:
         return jsonify({"message": f"Producto {producto_id} no es una receta, no necesita recálculo desde aquí. Use PUT para fijar su costo base.", "costo_actual": float(producto.costo_referencia_usd) if producto.costo_referencia_usd is not None else None }), 200

    try:
        print(f"--- INFO [recalcular_endpoint]: Forzando recálculo para producto receta ID {producto_id}...")
        nuevo_costo = calcular_costo_producto(producto_id)

        costo_anterior = producto.costo_referencia_usd
        mensaje = ""

        if nuevo_costo is not None:
            if costo_anterior is None or redondear_decimal(costo_anterior) != nuevo_costo:
                 producto.costo_referencia_usd = nuevo_costo
                 producto.fecha_actualizacion_costo = datetime.datetime.utcnow()
                 db.session.add(producto)
                 db.session.commit()
                 mensaje = f"Costo recalculado y actualizado de {costo_anterior} a {nuevo_costo}."
                 print(f"---   {mensaje}")
            else:
                 mensaje = f"Costo recalculado ({nuevo_costo}) es igual al actual. No se realizaron cambios."
                 print(f"---   {mensaje}")
        else:
             # Si el cálculo falla, ¿qué hacer? ¿Poner a None?
             if costo_anterior is not None:
                 producto.costo_referencia_usd = None
                 producto.fecha_actualizacion_costo = datetime.datetime.utcnow()
                 db.session.add(producto)
                 db.session.commit()
                 mensaje = f"No se pudo recalcular el costo (posiblemente falte costo de ingrediente o hubo ciclo). Costo fijado a None."
                 print(f"---   {mensaje}")
             else:
                  mensaje = f"No se pudo recalcular el costo y ya era None. No se realizaron cambios."
                  print(f"---   {mensaje}")


        return jsonify({
            "message": mensaje,
            "producto_id": producto.id,
            "costo_recalculado": float(nuevo_costo) if nuevo_costo is not None else None
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error EXCEPCION recalculando costo para producto {producto_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al recalcular el costo"}), 500
