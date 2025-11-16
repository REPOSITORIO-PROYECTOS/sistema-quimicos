# app/blueprints/compras.py

from flask import Blueprint, request, jsonify
from .. import db # Importar db desde app/__init__.py
# Importar TODOS los modelos necesarios desde app/models.py
from ..models import OrdenCompra, DetalleOrdenCompra, Producto, Proveedor, TipoCambio
# Importar funciones de cálculo si son necesarias (aunque actualizar costo se llama via endpoint)
# from .productos import actualizar_costo_desde_compra # Podría llamarse directo si se refactoriza
from decimal import Decimal, InvalidOperation, DivisionByZero
import logging
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES
import datetime
import uuid # Sigue siendo útil si usas UUIDs para IDs de OrdenCompra
import traceback
import requests # Necesario para llamar al endpoint de actualizar costo

#hola

# --- Configuración ---
# Obtener la URL base de la app actual o definirla. OJO: esto puede ser problemático.
# Es MEJOR pasar la URL base o usar una configuración central.
# Por ahora, asumimos que corre en localhost:5000. ¡¡AJUSTAR SI ES NECESARIO!!
BASE_API_URL = "http://localhost:8001"


# Crear el Blueprint
compras_bp = Blueprint('compras', __name__, url_prefix='/ordenes_compra')

# Logger del módulo
logger = logging.getLogger(__name__)


def _extract_user_info(current_user):
    """Devuelve (id, username, role) intentando soportar dicts y objetos."""
    uid = None
    uname = None
    urole = None
    if not current_user:
        return uid, uname, urole
    try:
        if isinstance(current_user, dict):
            uid = current_user.get('id') or current_user.get('user_id')
            uname = current_user.get('username') or current_user.get('name')
            urole = current_user.get('role')
        else:
            uid = getattr(current_user, 'id', None)
            uname = getattr(current_user, 'username', None) or getattr(current_user, 'name', None)
            urole = getattr(current_user, 'role', None)
    except Exception:
        # no debe romper si la estructura del current_user es inesperada
        return None, None, None
    return uid, uname, urole

# --- Estados Permitidos (Opcional, puede definirse en otro lugar) ---
ESTADOS_ORDEN = ["Solicitado", "Aprobado", "Rechazado", "Recibido", "Con Deuda", "Parcialmente Recibido"] # Añadir estado parcial
ESTADOS_RECEPCION = ["Completa", "Parcial", "Extra", "Con Daños"]
FORMAS_PAGO = ["Cheque", "Efectivo", "Transferencia", "Cuenta Corriente"]


# --- Función Auxiliar para formatear Orden para diferentes Roles ---
# (Adaptada para usar objetos SQLAlchemy y campos del modelo)
# app/blueprints/compras.py

def formatear_orden_por_rol(orden_db, rol="almacen"):
    """Filtra campos sensibles según el rol desde el objeto DB."""
    if not orden_db: return None

    orden_dict = {
        "id": orden_db.id,
        "nro_solicitud_interno": orden_db.nro_solicitud_interno,
        "nro_remito_proveedor": orden_db.nro_remito_proveedor,
        "ajuste_tc": orden_db.ajuste_tc,
        "fecha_creacion": orden_db.fecha_creacion.isoformat() if orden_db.fecha_creacion else None,
        "fecha_actualizacion": orden_db.fecha_actualizacion.isoformat() if orden_db.fecha_actualizacion else None,
        "estado": orden_db.estado,
        "proveedor_id": orden_db.proveedor_id,
        "proveedor_nombre": orden_db.proveedor.nombre if orden_db.proveedor else None,
        "cuenta": orden_db.cuenta,
        "iibb": orden_db.iibb,
        "observaciones_solicitud": orden_db.observaciones_solicitud,
        "cheque_perteneciente_a": orden_db.cheque_perteneciente_a,
        "importe_abonado": orden_db.importe_abonado,
        "tipo_caja": orden_db.tipo_caja,
        # --- CORRECCIÓN AQUÍ ---
        # Accede al ID del aprobador o al nombre, no al objeto completo
        "fecha_aprobacion": orden_db.fecha_aprobacion.isoformat() if orden_db.fecha_aprobacion else None,
        "aprobado_por": orden_db.aprobado_por_id.username if orden_db.aprobado_por_id else None, # Ejemplo si tienes una relación y quieres el nombre de usuario
        
        "forma_pago": orden_db.forma_pago,
        "fecha_rechazo": orden_db.fecha_rechazo.isoformat() if orden_db.fecha_rechazo else None,
        "motivo_rechazo": orden_db.motivo_rechazo,
        "fecha_recepcion": orden_db.fecha_recepcion.isoformat() if orden_db.fecha_recepcion else None,

        # --- Y CORRECCIÓN AQUÍ ---
        # Accede al ID del receptor o al nombre, no al objeto completo
        "recibido_por": orden_db.recibido_por_id.username if orden_db.recibido_por_id else None, # Ejemplo si tienes una relación y quieres el nombre de usuario
        
        "estado_recepcion": orden_db.estado_recepcion,
        "notas_recepcion": orden_db.notas_recepcion,
    }

    # El resto de la función (procesamiento de items y campos de ADMIN) se mantiene igual...
    
    items_list = []
    items_db = orden_db.items
    if items_db:
        for item_db in items_db:
            # Tu lógica de items aquí...
            # Asegúrate de que aquí tampoco estés pasando objetos completos
            item_dict = {
                "id_linea": item_db.id,
                "producto_id": item_db.producto_id,
                "producto_codigo": item_db.producto.id if item_db.producto else 'N/A',
                "producto_nombre": item_db.producto.nombre if item_db.producto else 'N/A',
                "cantidad_solicitada": float(item_db.cantidad_solicitada) if item_db.cantidad_solicitada is not None else None,
                "cantidad_recibida": float(item_db.cantidad_recibida) if item_db.cantidad_recibida is not None else None,
                "notas_item_recepcion": item_db.notas_item_recepcion,
                "precio_unitario_estimado": float(item_db.precio_unitario_estimado) if item_db.precio_unitario_estimado is not None else None,
                "importe_linea_estimado": float(item_db.importe_linea_estimado) if item_db.importe_linea_estimado is not None else None
            }
            items_list.append(item_dict)
    orden_dict["items"] = items_list

    if rol == "ADMIN":
        orden_dict.update({
            "importe_total_estimado": float(orden_db.importe_total_estimado) if orden_db.importe_total_estimado is not None else None,
            "ajuste_tc": orden_db.ajuste_tc,
            "importe_abonado": float(orden_db.importe_abonado) if orden_db.importe_abonado is not None else None,
            "forma_pago": orden_db.forma_pago,
            "cheque_perteneciente_a": orden_db.cheque_perteneciente_a,
        })

    return orden_dict


# --- Endpoint: Crear Nueva Orden de Compra (Solicitud) ---
@compras_bp.route('/crear', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['ALMACEN']) 
def crear_orden_compra(current_user):
    """Registra una nueva solicitud de orden de compra."""
    logger.info("Recibida solicitud POST en /ordenes_compra")
    data = request.get_json()
    # Obtener info real del usuario autenticado
    usuario_solicitante_id, usuario_nombre, rol_usuario = _extract_user_info(current_user)

    if not data: return jsonify({"error": "Payload JSON vacío"}), 400

    # --- Validación de Entrada ---
    proveedor_id = data.get('proveedor_id')
    items_payload = data.get('items')

    if not proveedor_id or not isinstance(proveedor_id, int):
        return jsonify({"error": "Falta o es inválido 'proveedor_id' (int)"}), 400
    if not items_payload or not isinstance(items_payload, list) or not items_payload:
        return jsonify({"error": "Falta o está vacía la lista 'items'"}), 400

    # --- Verificar Existencia de Proveedor ---
    proveedor = db.session.get(Proveedor, proveedor_id)
    if not proveedor:
        return jsonify({"error": f"Proveedor con ID {proveedor_id} no encontrado"}), 404

    detalles_db = []
    importe_total_estimado_calc = Decimal("0.00")

    try:
        # --- Procesar Items ---
        for idx, item_data in enumerate(items_payload):
            codigo_interno_prod = item_data.get("codigo_interno")
            cantidad_str = str(item_data.get("cantidad", "0")).replace(',', '.')
            # Precio estimado opcional que podría venir del front o calcularse
            precio_estimado_str = str(item_data.get("precio_unitario_estimado", "0")).replace(',', '.')

            if not codigo_interno_prod:
                return jsonify({"error": f"Falta 'codigo_interno' en item #{idx+1}"}), 400

            # Validar y obtener producto
            producto = Producto.query.filter_by(id=codigo_interno_prod).first()
            if not producto:
                return jsonify({"error": f"Producto con código interno '{codigo_interno_prod}' no encontrado (item #{idx+1})"}), 404

            try:
                cantidad = Decimal(cantidad_str)
                precio_estimado = Decimal(precio_estimado_str)
                if cantidad <= 0: raise ValueError("Cantidad debe ser positiva")
                if precio_estimado < 0: raise ValueError("Precio estimado no puede ser negativo")
            except (ValueError, InvalidOperation):
                return jsonify({"error": f"Cantidad o precio estimado inválido en item #{idx+1}"}), 400

            # Calcular importe estimado de la línea
            importe_linea_estimado = (cantidad * precio_estimado).quantize(Decimal("0.01"))
            importe_total_estimado_calc += importe_linea_estimado

            # Crear objeto DetalleOrdenCompra
            detalle = DetalleOrdenCompra(
                producto_id=producto.id,
                cantidad_solicitada=cantidad,
                precio_unitario_estimado=precio_estimado,
                importe_linea_estimado=importe_linea_estimado
                # cantidad_recibida se inicializa en None/0 por defecto en el modelo
            )
            detalles_db.append(detalle)

        # --- Crear Cabecera de la Orden ---
        # Generar un ID único si usas UUID como PK string
        # nuevo_id_orden = str(uuid.uuid4())
        # O dejar que el autoincremento de la DB genere el ID int

        # Generar número de solicitud interno (ejemplo simple)
        # Podrías tener una secuencia en la DB o una lógica más robusta
        num_ordenes_hoy = OrdenCompra.query.filter(db.func.date(OrdenCompra.fecha_creacion) == datetime.date.today()).count()
        nro_interno_solicitud = f"OC-{datetime.date.today().strftime('%Y%m%d')}-{num_ordenes_hoy+1:04d}"

        # Si el usuario es Admin, la OC se crea directamente como 'Aprobado' y se registra el aprobador
        if rol_usuario and rol_usuario.upper() == "ADMIN":
            nueva_orden = OrdenCompra(
                nro_solicitud_interno=nro_interno_solicitud,
                proveedor_id=proveedor_id,
                forma_pago=data.get("forma_pago"),
                importe_total_estimado=importe_total_estimado_calc,
                observaciones_solicitud=data.get("observaciones_solicitud"),
                estado="Aprobado",
                solicitado_por_id=usuario_solicitante_id,
                aprobado_por_id=usuario_solicitante_id,
                fecha_aprobacion=datetime.datetime.now()
            )
        else:
            nueva_orden = OrdenCompra(
                nro_solicitud_interno=nro_interno_solicitud,
                proveedor_id=proveedor_id,
                forma_pago=data.get("forma_pago"),
                importe_total_estimado=importe_total_estimado_calc,
                observaciones_solicitud=data.get("observaciones_solicitud"),
                estado="Solicitado",
                solicitado_por_id=usuario_solicitante_id
            )

        # Asociar detalles a la orden
        nueva_orden.items = detalles_db # SQLAlchemy maneja la FK

        db.session.add(nueva_orden)
        db.session.commit()

        logger.info("Orden de compra creada: ID %s, Nro Interno %s", nueva_orden.id, nro_interno_solicitud)
        # Devolver la orden completa (formateada por rol, ADMIN ve todo al crear)
        return jsonify({
            "status": "success",
            "message": "Orden de compra solicitada exitosamente.",
            "orden": formatear_orden_por_rol(nueva_orden, rol="ADMIN")
        }), 201

    except (ValueError, TypeError, InvalidOperation) as e:
        db.session.rollback()
        logger.exception("Datos inválidos al procesar items de orden: %s", e)
        return jsonify({"error": f"Error en los datos de los items: {e}"}), 400
    except Exception as e:
        db.session.rollback()
        logger.exception("Excepción inesperada al crear orden de compra")
        return jsonify({"error": "Error interno del servidor al crear la orden"}), 500


# --- Endpoint: Obtener Órdenes de Compra (Lista) ---
@compras_bp.route('/obtener_todas', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['ALMACEN'], ROLES['CONTABLE']) 
def obtener_ordenes_compra(current_user):
    """Obtiene lista de órdenes de compra, con filtros opcionales y paginación."""
    logger.info("Recibida solicitud GET en /ordenes_compra")
    rol_usuario = request.headers.get("X-User-Role", "almacen")  # Simular rol

    try:
        query = OrdenCompra.query

        # --- Aplicar Filtros ---
        estado_filtro = request.args.get('estado')
        if estado_filtro:
            if estado_filtro not in ESTADOS_ORDEN:  # Validar estado
                return jsonify({"error": f"Estado de filtro inválido: '{estado_filtro}'"}), 400
            query = query.filter(OrdenCompra.estado == estado_filtro)
            logger.debug("Filtrando por estado: %s", estado_filtro)

        proveedor_id_filtro = request.args.get('proveedor_id', type=int)
        if proveedor_id_filtro:
            query = query.filter(OrdenCompra.proveedor_id == proveedor_id_filtro)
            logger.debug("Filtrando por proveedor ID: %s", proveedor_id_filtro)

        # Ordenar (ej: por fecha creación descendente)
        query = query.order_by(OrdenCompra.fecha_creacion.desc())

        # --- Paginación ---
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        paginated_result = query.paginate(page=page, per_page=per_page, error_out=False)
        ordenes_db = paginated_result.items

        # Formatear resultado según rol
        ordenes_formateadas = [formatear_orden_por_rol(orden, rol_usuario) for orden in ordenes_db]

        logger.info("Devolviendo %s órdenes para rol %s", len(ordenes_formateadas), rol_usuario)

        # Devolver los resultados con los datos de paginación
        return jsonify({
            "ordenes": ordenes_formateadas,
            "pagination": {
                "total_items": paginated_result.total,
                "total_pages": paginated_result.pages,
                "current_page": page,
                "per_page": per_page,
                "has_next": paginated_result.has_next,
                "has_prev": paginated_result.has_prev
            }
        })

    except Exception as e:
        logger.exception("Excepción inesperada al obtener órdenes de compra")
        return jsonify({"error": "Error interno del servidor al obtener las órdenes"}), 500

# def obtener_ordenes_compra(current_user):
#     """Obtiene lista de órdenes, con filtros opcionales y formateada por rol."""
#     print("\n--- INFO: Recibida solicitud GET en /ordenes_compra ---")
#     rol_usuario = request.headers.get("X-User-Role", "almacen") # Simular rol

#     try:
#         query = OrdenCompra.query

#         # --- Aplicar Filtros ---
#         estado_filtro = request.args.get('estado')
#         if estado_filtro:
#             if estado_filtro not in ESTADOS_ORDEN: # Validar estado
#                 return jsonify({"error": f"Estado de filtro inválido: '{estado_filtro}'"}), 400
#             query = query.filter(OrdenCompra.estado == estado_filtro)
#             print(f"--- DEBUG: Filtrando por estado: {estado_filtro}")

#         proveedor_id_filtro = request.args.get('proveedor_id', type=int)
#         if proveedor_id_filtro:
#             query = query.filter(OrdenCompra.proveedor_id == proveedor_id_filtro)
#             print(f"--- DEBUG: Filtrando por proveedor ID: {proveedor_id_filtro}")

#         # Ordenar (ej: por fecha creación descendente)
#         query = query.order_by(OrdenCompra.fecha_creacion.desc())

#         # Considerar paginación aquí también para listas largas
#         ordenes_db = query.all()

#         # Formatear resultado según rol
#         ordenes_formateadas = [formatear_orden_por_rol(orden, rol_usuario) for orden in ordenes_db]

#         print(f"--- INFO: Devolviendo {len(ordenes_formateadas)} órdenes para rol '{rol_usuario}'")
#         return jsonify(ordenes_formateadas)

#     except Exception as e:
#         print(f"ERROR: Excepción inesperada al obtener órdenes de compra")
#         traceback.print_exc()
#         return jsonify({"error": "Error interno del servidor al obtener las órdenes"}), 500


# --- Endpoint: Obtener Orden de Compra Específica ---
@compras_bp.route('/obtener/<int:orden_id>', methods=['GET']) # Asume ID entero autoincremental
@token_required
@roles_required(ROLES['ADMIN'], ROLES['ALMACEN'], ROLES['CONTABLE']) 
def obtener_orden_compra_por_id(current_user, orden_id):
    """Obtiene una orden específica, formateada por rol."""
    logger.info("Recibida solicitud GET en /ordenes_compra/%s", orden_id)
    rol_usuario = request.headers.get("X-User-Role", "almacen") # Simular rol

    try:
        # Usar .options(db.joinedload('*')) o selectinload para Eager Loading si es necesario
        # orden_db = db.session.get(OrdenCompra, orden_id, options=[db.selectinload(OrdenCompra.items).selectinload(DetalleOrdenCompra.producto)])
        orden_db = db.session.get(OrdenCompra, orden_id) # .get es bueno para PK
        if not orden_db:
            return jsonify({"error": "Orden de compra no encontrada"}), 404

        orden_formateada = formatear_orden_por_rol(orden_db, rol_usuario)
        logger.info("Devolviendo orden %s para rol %s", orden_id, rol_usuario)
        return jsonify(orden_formateada)

    except Exception as e:
        logger.exception("Excepción inesperada al obtener orden de compra %s", orden_id)
        return jsonify({"error": "Error interno del servidor al obtener la orden"}), 500


# --- Endpoint: Aprobar Orden de Compra ---
@compras_bp.route('/aprobar/<int:orden_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN']) # Solo ADMIN puede aprobar 
def aprobar_orden_compra(current_user, orden_id):
    """Cambia el estado de una orden a 'Aprobado' (Rol     ADMIN)."""
    logger.info("Recibida solicitud PUT en /ordenes_compra/%s/aprobar", orden_id)
    rol_usuario = request.headers.get("X-User-Role", "almacen") # Simular rol
    usuario_aprobador = request.headers.get("X-User-Name", "Sistema") # Simular usuario aprobador

    # --- Validación de Rol (Simulada - Reemplazar con real) ---
    if rol_usuario != "ADMIN":
        return jsonify({"error": "Acción no permitida para este rol."}), 403 # Forbidden

    data = request.json
    if not data:
        return jsonify({"error": "Payload JSON vacío"}), 400

    try:
        orden_db = db.session.query(OrdenCompra).options(
            db.selectinload(OrdenCompra.items)
        ).get(orden_id)
        if not orden_db:
            return jsonify({"error": "Orden de compra no encontrada"}), 404

        # Validar estado actual
        if orden_db.estado != 'Solicitado':
            return jsonify({"error": f"Solo se pueden aprobar órdenes en estado 'Solicitado'. Estado actual: {orden_db.estado}"}), 409 # Conflict

        # --- Actualizar datos generales de la Orden de Compra ---
        orden_db.proveedor_id = data.get('proveedor_id', orden_db.proveedor_id)
        orden_db.cuenta = data.get('cuenta', orden_db.cuenta)
        orden_db.iibb = data.get('iibb', orden_db.iibb)
        orden_db.observaciones_solicitud = data.get('observaciones_solicitud', orden_db.observaciones_solicitud)
        if 'ajuste_tc' in data:
            ajuste_valor = data.get('ajuste_tc')
            orden_db.ajuste_tc = str(ajuste_valor).lower() == 'true' or ajuste_valor is True

        # --- Actualizar datos de pago (si vienen) ---
        if 'importe_abonado' in data:
            try:
                orden_db.importe_abonado = Decimal(str(data.get('importe_abonado')))
            except (InvalidOperation, TypeError):
                logger.warning("importe_abonado inválido en aprobación, se mantiene valor previo")
        orden_db.forma_pago = data.get('forma_pago', orden_db.forma_pago)
        if orden_db.forma_pago == 'Cheque':
            orden_db.cheque_perteneciente_a = data.get('cheque_perteneciente_a', orden_db.cheque_perteneciente_a)
        else:
            orden_db.cheque_perteneciente_a = None

        # --- Actualizar items (solo si vienen en el payload) ---
        items_payload = data.get('items', [])
        if items_payload and orden_db.items:
            for item_data in items_payload:
                id_linea = item_data.get('id_linea')
                detalle = next((item for item in orden_db.items if item.id == id_linea), None)
                if detalle:
                    if 'cantidad_solicitada' in item_data:
                        detalle.cantidad_solicitada = item_data['cantidad_solicitada']
                    if 'precio_unitario_estimado' in item_data:
                        detalle.precio_unitario_estimado = item_data['precio_unitario_estimado']
                    # Recalcular importe línea si ambos presentes
                    if 'cantidad_solicitada' in item_data and 'precio_unitario_estimado' in item_data:
                        detalle.importe_linea_estimado = item_data['cantidad_solicitada'] * item_data['precio_unitario_estimado']

        # Actualizar el importe total de la orden con el del payload o recalcular
        if 'importe_total_estimado' in data:
            orden_db.importe_total_estimado = data['importe_total_estimado']
        else:
            # Recalcular si no viene
            total = sum([item.importe_linea_estimado or 0 for item in orden_db.items])
            orden_db.importe_total_estimado = total

        # --- Actualizar estado y aprobador ---
        orden_db.estado = 'Aprobado'
        orden_db.fecha_aprobacion = datetime.datetime.utcnow()
        orden_db.aprobado_por = usuario_aprobador
        # fecha_actualizacion se actualiza via onupdate

        db.session.commit()
        logger.info("Orden %s aprobada por %s", orden_id, usuario_aprobador)

        return jsonify({
            "status": "success",
            "message": "Orden de compra aprobada.",
            "orden": formatear_orden_por_rol(orden_db, rol_usuario) # Devolver estado actualizado
        })

    except Exception as e:
        db.session.rollback()
        logger.exception("Excepción inesperada al aprobar orden %s", orden_id)
        return jsonify({"error": "Error interno del servidor al aprobar la orden"}), 500


# --- Endpoint: Rechazar Orden de Compra ---
@compras_bp.route('/rechazar/<int:orden_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN']) # Solo ADMIN puede rechazar 
def rechazar_orden_compra(current_user, orden_id):
    """Cambia el estado de una orden a 'Rechazado' (Rol     ADMIN)."""
    logger.info("Recibida solicitud PUT en /ordenes_compra/%s/rechazar", orden_id)
    rol_usuario = request.headers.get("X-User-Role", "almacen")
    usuario_rechazador = request.headers.get("X-User-Name", "Sistema")
    data = request.json

    # --- Validaciones ---
    if rol_usuario != "ADMIN":
        return jsonify({"error": "Acción no permitida para este rol."}), 403
    if not data or not data.get('motivo_rechazo'):
         return jsonify({"error": "Falta el campo 'motivo_rechazo' en el payload JSON."}), 400

    try:
        orden_db = db.session.get(OrdenCompra, orden_id)
        if not orden_db:
            return jsonify({"error": "Orden de compra no encontrada"}), 404

        if orden_db.estado != 'Solicitado':
            return jsonify({"error": f"Solo se pueden rechazar órdenes en estado 'Solicitado'. Estado actual: {orden_db.estado}"}), 409 # Conflict

        # --- Actualizar Orden ---
        orden_db.estado = 'Rechazado'
        orden_db.fecha_rechazo = datetime.datetime.utcnow()
        orden_db.rechazado_por = usuario_rechazador
        orden_db.motivo_rechazo = data['motivo_rechazo']

        db.session.commit()
        logger.info("Orden %s rechazada por %s. Motivo: %s", orden_id, usuario_rechazador, data['motivo_rechazo'])

        return jsonify({
            "status": "success",
            "message": "Orden de compra rechazada.",
            "orden": formatear_orden_por_rol(orden_db, rol_usuario)
        })

    except Exception as e:
        db.session.rollback()
        logger.exception("Excepción inesperada al rechazar orden %s", orden_id)
        return jsonify({"error": "Error interno del servidor al rechazar la orden"}), 500


# --- Endpoint: Recibir Mercadería de Orden de Compra ---
@compras_bp.route('/recibir/<int:orden_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN'])
def recibir_orden_compra(current_user, orden_id):
    logger.info("Recibida solicitud PUT en /ordenes_compra/%s/recibir", orden_id)
    rol_usuario = request.headers.get("X-User-Role", "almacen")
    usuario_receptor = request.headers.get("X-User-Name", "Sistema")
    data = request.json

    if not data:
        return jsonify({"error": "Payload JSON vacío"}), 400

    try:
        orden_db = db.session.query(OrdenCompra).options(
            db.selectinload(OrdenCompra.items)
        ).get(orden_id)

        if not orden_db:
            return jsonify({"error": "Orden de compra no encontrada"}), 404
            
        
        # 1. Actualizar datos generales de la Orden de Compra
        orden_db.proveedor_id = data.get('proveedor_id', orden_db.proveedor_id)
        orden_db.cuenta = data.get('cuenta', orden_db.cuenta)
        orden_db.iibb = data.get('iibb', orden_db.iibb)

        if 'ajuste_tc' in data:
            ajuste_valor = data.get('ajuste_tc')
            orden_db.ajuste_tc = str(ajuste_valor).lower() == 'true' or ajuste_valor is True
        
        # 2. Actualizar datos de los items y calcular total
        total_estimado_recalculado = Decimal('0.0')
        if orden_db.items:
            detalle_a_modificar = orden_db.items[0] # Asumimos una sola línea por ahora
            
            # Convertir valores del payload a Decimal de forma segura
            cantidad_solicitada = Decimal(str(data.get('cantidad', '0')))
            precio_unitario = Decimal(str(data.get('precio_unitario', '0')))
            
            detalle_a_modificar.cantidad_solicitada = cantidad_solicitada
            detalle_a_modificar.precio_unitario_estimado = precio_unitario
            
            importe_linea = cantidad_solicitada * precio_unitario
            detalle_a_modificar.importe_linea_estimado = importe_linea
            total_estimado_recalculado = importe_linea

        # Actualizar el importe total de la orden con el del payload o el recalculado
        orden_db.importe_total_estimado = Decimal(str(data.get('importe_total', total_estimado_recalculado)))

        # 3. Procesar la recepción de items
        items_recibidos = data.get('items_recibidos', [])
        for item_data in items_recibidos:
            id_linea = item_data.get('id_linea')
            detalle_para_recepcion = next((item for item in orden_db.items if item.id == id_linea), None)
            
            if detalle_para_recepcion:
                cantidad_recibida_ahora = Decimal(str(item_data.get('cantidad_recibida', '0')))
                if orden_db.estado not in ['Aprobado', 'Parcialmente Recibido', 'Con Deuda'] and item_data.get('cantidad_recibida') > 0 :
                     return jsonify({"error": f"No se puede recibir mercadería para una orden con estado: {orden_db.estado}"}), 409

                # Sumar a lo que ya se haya recibido antes
                cantidad_previa = detalle_para_recepcion.cantidad_recibida or Decimal('0')
                detalle_para_recepcion.cantidad_recibida = cantidad_previa + cantidad_recibida_ahora

        # 4. Actualizar cabecera de la recepción
        orden_db.fecha_recepcion = datetime.datetime.utcnow()
        orden_db.recibido_por = usuario_receptor
        orden_db.nro_remito_proveedor = data.get('nro_remito_proveedor')
        orden_db.estado_recepcion = data.get('estado_recepcion')

        # 5. Procesar el pago y determinar el estado final
        nuevo_abono = Decimal(str(data.get('importe_abonado', '0')))
        importe_abonado_previo = orden_db.importe_abonado or Decimal('0')
        orden_db.importe_abonado = importe_abonado_previo + nuevo_abono

        if orden_db.importe_abonado >= orden_db.importe_total_estimado:
            orden_db.estado = 'Recibido'
        else:
            orden_db.estado = 'Con Deuda'
        
        # 6. Actualizar datos de pago
        orden_db.forma_pago = data.get('forma_pago', orden_db.forma_pago)
        if orden_db.forma_pago == 'Cheque':
            orden_db.cheque_perteneciente_a = data.get('cheque_perteneciente_a')
        else:
            orden_db.cheque_perteneciente_a = None # Limpiar si no es cheque
        orden_db.tipo_caja = data.get('tipo_caja', orden_db.tipo_caja)
        db.session.commit()
        
        return jsonify({
            "status": "success",
            "message": "Mercadería registrada y orden actualizada correctamente.",
            "orden": formatear_orden_por_rol(orden_db, rol_usuario)
        })

    except (InvalidOperation, TypeError) as e:
        db.session.rollback()
        logger.exception("Error de conversión de datos en la orden %s: %s", orden_id, e)
        return jsonify({"error": f"Dato numérico inválido: {e}"}), 400
    except Exception as e:
        db.session.rollback()
        logger.exception("Excepción inesperada al recibir orden %s: %s", orden_id, e)
        return jsonify({"error": "Error interno del servidor al procesar la recepción"}), 500