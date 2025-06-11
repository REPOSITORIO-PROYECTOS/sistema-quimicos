# app/blueprints/compras.py

from flask import Blueprint, request, jsonify
from .. import db # Importar db desde app/__init__.py
# Importar TODOS los modelos necesarios desde app/models.py
from ..models import OrdenCompra, DetalleOrdenCompra, Producto, Proveedor, TipoCambio
# Importar funciones de cálculo si son necesarias (aunque actualizar costo se llama via endpoint)
# from .productos import actualizar_costo_desde_compra # Podría llamarse directo si se refactoriza
from decimal import Decimal, InvalidOperation, DivisionByZero
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES
import datetime
import uuid # Sigue siendo útil si usas UUIDs para IDs de OrdenCompra
import traceback
import requests # Necesario para llamar al endpoint de actualizar costo



# --- Configuración ---
# Obtener la URL base de la app actual o definirla. OJO: esto puede ser problemático.
# Es MEJOR pasar la URL base o usar una configuración central.
# Por ahora, asumimos que corre en localhost:5000. ¡¡AJUSTAR SI ES NECESARIO!!
BASE_API_URL = "http://localhost:8001"


# Crear el Blueprint
compras_bp = Blueprint('compras', __name__, url_prefix='/ordenes_compra')

# --- Estados Permitidos (Opcional, puede definirse en otro lugar) ---
ESTADOS_ORDEN = ["Solicitado", "Aprobado", "Rechazado", "Recibido", "Con Deuda", "Parcialmente Recibido"] # Añadir estado parcial
ESTADOS_RECEPCION = ["Completa", "Parcial", "Extra", "Con Daños"]
FORMAS_PAGO = ["Cheque", "Efectivo", "Transferencia", "Cuenta Corriente"]


# --- Función Auxiliar para formatear Orden para diferentes Roles ---
# (Adaptada para usar objetos SQLAlchemy y campos del modelo)
def formatear_orden_por_rol(orden_db, rol="almacen"):
    """Filtra campos sensibles según el rol desde el objeto DB."""
    if not orden_db: return None

    # Campos comunes siempre visibles
    orden_dict = {
        "id": orden_db.id, # Asume que el ID es serializable (string UUID o int)
        "nro_solicitud_interno": orden_db.nro_solicitud_interno,
        "nro_remito_proveedor": orden_db.nro_remito_proveedor,
        "fecha_creacion": orden_db.fecha_creacion.isoformat() if orden_db.fecha_creacion else None,
        "fecha_actualizacion": orden_db.fecha_actualizacion.isoformat() if orden_db.fecha_actualizacion else None,
        "estado": orden_db.estado,
        "proveedor_id": orden_db.proveedor_id,
        "proveedor_nombre": orden_db.proveedor.nombre if orden_db.proveedor else None, # Nombre actual del proveedor
        "observaciones_solicitud": orden_db.observaciones_solicitud,
        # Campos de aprobación
        "fecha_aprobacion": orden_db.fecha_aprobacion.isoformat() if orden_db.fecha_aprobacion else None,
        "aprobado_por": orden_db.aprobado_por_id,
        "forma_pago": orden_db.forma_pago,
        # Campos de rechazo
        "fecha_rechazo": orden_db.fecha_rechazo.isoformat() if orden_db.fecha_rechazo else None,
#        "rechazado_por": orden_db.rechazado_por,
        "motivo_rechazo": orden_db.motivo_rechazo,
        # Campos de recepción
        "fecha_recepcion": orden_db.fecha_recepcion.isoformat() if orden_db.fecha_recepcion else None,
        "recibido_por": orden_db.recibido_por_id,
        "estado_recepcion": orden_db.estado_recepcion,
        "notas_recepcion": orden_db.notas_recepcion,
        # "cantidad_recepcionada_acumulada_calc": float(orden_db.calcular_cantidad_recibida_total()), # Si tienes un método así
    }

    # Items: Almacén ve info básica,     ADMIN ve costos/precios estimados
    items_list = []
    # Usar .all() si la relación es lazy='dynamic'
    # items_db = orden_db.items.all() if hasattr(orden_db.items, 'all') else orden_db.items
    items_db = orden_db.items # Asumiendo relación normal o eager loading si se configura
    if items_db:
        for item_db in items_db:
            item_dict = {
                "id_linea": item_db.id, # ID del detalle
                "producto_id": item_db.producto_id,
                "producto_codigo": item_db.producto.id if item_db.producto else 'N/A',
                "producto_nombre": item_db.producto.nombre if item_db.producto else 'N/A',
                "cantidad_solicitada": float(item_db.cantidad_solicitada) if item_db.cantidad_solicitada is not None else None,
                "cantidad_recibida": float(item_db.cantidad_recibida) if item_db.cantidad_recibida is not None else None,
                "notas_item_recepcion": item_db.notas_item_recepcion,
                "precio_unitario_estimado": float(item_db.precio_unitario_estimado) if item_db.precio_unitario_estimado is not None else None,
                "importe_linea_estimado": float(item_db.importe_linea_estimado) if item_db.importe_linea_estimado is not None else None
            }
            if rol == "ADMIN":
                item_dict.update({
                    "precio_unitario_estimado": float(item_db.precio_unitario_estimado) if item_db.precio_unitario_estimado is not None else None,
                    "importe_linea_estimado": float(item_db.importe_linea_estimado) if item_db.importe_linea_estimado is not None else None,
                    # Podrías añadir el costo ARS real de recepción si lo guardas en DetalleOrdenCompra
                    # "costo_unitario_recepcion_ars": float(item_db.costo_unitario_recepcion_ars) if item_db.costo_unitario_recepcion_ars is not None else None,
                })
            items_list.append(item_dict)
    orden_dict["items"] = items_list

    # Campos solo para ADMIN
    if rol == "ADMIN":
        orden_dict.update({
            "importe_total_estimado": float(orden_db.importe_total_estimado) if orden_db.importe_total_estimado is not None else None,
            # "importe_total_recibido_calc": float(orden_db.calcular_importe_recibido_total()), # Si tienes método
            "ajuste_tc": orden_db.ajuste_tc, # SI/NO o True/False? Asegurar consistencia
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
    print("\n--- INFO: Recibida solicitud POST en /ordenes_compra ---")
    data = request.get_json()
    # Simular rol y usuario (reemplazar con autenticación real)
    rol_usuario = request.headers.get("X-User-Role", "almacen")
    usuario_solicitante_id = request.headers.get("X-User-Id", "0") # Quién solicita

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

        nueva_orden = OrdenCompra(
            # id=nuevo_id_orden, # Si usas UUID string PK
            nro_solicitud_interno=nro_interno_solicitud,
            proveedor_id=proveedor_id,
            forma_pago=data.get("forma_pago"),
            importe_total_estimado=importe_total_estimado_calc,
            observaciones_solicitud=data.get("observaciones_solicitud"),
            estado="Solicitado", # Estado inicial
            solicitado_por_id=usuario_solicitante_id # Guardar quién solicitó
            # Otros campos se inicializan con default/None en el modelo
        )

        # Asociar detalles a la orden
        nueva_orden.items = detalles_db # SQLAlchemy maneja la FK

        db.session.add(nueva_orden)
        db.session.commit()

        print(f"INFO: Orden de compra creada: ID {nueva_orden.id}, Nro Interno {nro_interno_solicitud}")
        # Devolver la orden completa (formateada por rol, ADMIN ve todo al crear)
        return jsonify({
            "status": "success",
            "message": "Orden de compra solicitada exitosamente.",
            "orden": formatear_orden_por_rol(nueva_orden, rol="ADMIN")
            }), 201

    except (ValueError, TypeError, InvalidOperation) as e:
         db.session.rollback()
         print(f"ERROR: Datos inválidos al procesar items de orden - {e}")
         return jsonify({"error": f"Error en los datos de los items: {e}"}), 400
    except Exception as e:
        db.session.rollback()
        print(f"ERROR: Excepción inesperada al crear orden de compra")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al crear la orden"}), 500


# --- Endpoint: Obtener Órdenes de Compra (Lista) ---
@compras_bp.route('/obtener_todas', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['ALMACEN'], ROLES['CONTABLE']) 
def obtener_ordenes_compra(current_user):
    """Obtiene lista de órdenes de compra, con filtros opcionales y paginación."""
    print("\n--- INFO: Recibida solicitud GET en /ordenes_compra ---")
    rol_usuario = request.headers.get("X-User-Role", "almacen")  # Simular rol

    try:
        query = OrdenCompra.query

        # --- Aplicar Filtros ---
        estado_filtro = request.args.get('estado')
        if estado_filtro:
            if estado_filtro not in ESTADOS_ORDEN:  # Validar estado
                return jsonify({"error": f"Estado de filtro inválido: '{estado_filtro}'"}), 400
            query = query.filter(OrdenCompra.estado == estado_filtro)
            print(f"--- DEBUG: Filtrando por estado: {estado_filtro}")

        proveedor_id_filtro = request.args.get('proveedor_id', type=int)
        if proveedor_id_filtro:
            query = query.filter(OrdenCompra.proveedor_id == proveedor_id_filtro)
            print(f"--- DEBUG: Filtrando por proveedor ID: {proveedor_id_filtro}")

        # Ordenar (ej: por fecha creación descendente)
        query = query.order_by(OrdenCompra.fecha_creacion.desc())

        # --- Paginación ---
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        paginated_result = query.paginate(page=page, per_page=per_page, error_out=False)
        ordenes_db = paginated_result.items

        # Formatear resultado según rol
        ordenes_formateadas = [formatear_orden_por_rol(orden, rol_usuario) for orden in ordenes_db]

        print(f"--- INFO: Devolviendo {len(ordenes_formateadas)} órdenes para rol '{rol_usuario}'")

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
        print(f"ERROR: Excepción inesperada al obtener órdenes de compra")
        traceback.print_exc()
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
    print(f"\n--- INFO: Recibida solicitud GET en /ordenes_compra/{orden_id} ---")
    rol_usuario = request.headers.get("X-User-Role", "almacen") # Simular rol

    try:
        # Usar .options(db.joinedload('*')) o selectinload para Eager Loading si es necesario
        # orden_db = db.session.get(OrdenCompra, orden_id, options=[db.selectinload(OrdenCompra.items).selectinload(DetalleOrdenCompra.producto)])
        orden_db = db.session.get(OrdenCompra, orden_id) # .get es bueno para PK
        if not orden_db:
            return jsonify({"error": "Orden de compra no encontrada"}), 404

        orden_formateada = formatear_orden_por_rol(orden_db, rol_usuario)
        print(f"--- INFO: Devolviendo orden {orden_id} para rol '{rol_usuario}'")
        return jsonify(orden_formateada)

    except Exception as e:
        print(f"ERROR: Excepción inesperada al obtener orden de compra {orden_id}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al obtener la orden"}), 500


# --- Endpoint: Aprobar Orden de Compra ---
@compras_bp.route('/aprobar/<int:orden_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN']) # Solo ADMIN puede aprobar 
def aprobar_orden_compra(current_user, orden_id):
    """Cambia el estado de una orden a 'Aprobado' (Rol     ADMIN)."""
    print(f"\n--- INFO: Recibida solicitud PUT en /ordenes_compra/{orden_id}/aprobar ---")
    rol_usuario = request.headers.get("X-User-Role", "almacen") # Simular rol
    usuario_aprobador = request.headers.get("X-User-Name", "Sistema") # Simular usuario aprobador

    # --- Validación de Rol (Simulada - Reemplazar con real) ---
    if rol_usuario != "ADMIN":
        return jsonify({"error": "Acción no permitida para este rol."}), 403 # Forbidden

    try:
        orden_db = db.session.get(OrdenCompra, orden_id)
        if not orden_db:
            return jsonify({"error": "Orden de compra no encontrada"}), 404

        # Validar estado actual
        if orden_db.estado != 'Solicitado':
            return jsonify({"error": f"Solo se pueden aprobar órdenes en estado 'Solicitado'. Estado actual: {orden_db.estado}"}), 409 # Conflict

        # --- Actualizar Orden ---
        orden_db.estado = 'Aprobado'
        orden_db.fecha_aprobacion = datetime.datetime.utcnow()
        orden_db.aprobado_por = usuario_aprobador
        # fecha_actualizacion se actualiza via onupdate

        db.session.commit()
        print(f"--- INFO: Orden {orden_id} aprobada por '{usuario_aprobador}'")

        return jsonify({
            "status": "success",
            "message": "Orden de compra aprobada.",
            "orden": formatear_orden_por_rol(orden_db, rol_usuario) # Devolver estado actualizado
            })

    except Exception as e:
        db.session.rollback()
        print(f"ERROR: Excepción inesperada al aprobar orden {orden_id}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al aprobar la orden"}), 500


# --- Endpoint: Rechazar Orden de Compra ---
@compras_bp.route('/rechazar/<int:orden_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN']) # Solo ADMIN puede rechazar 
def rechazar_orden_compra(current_user, orden_id):
    """Cambia el estado de una orden a 'Rechazado' (Rol     ADMIN)."""
    print(f"\n--- INFO: Recibida solicitud PUT en /ordenes_compra/{orden_id}/rechazar ---")
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
        print(f"--- INFO: Orden {orden_id} rechazada por '{usuario_rechazador}'. Motivo: {data['motivo_rechazo']}")

        return jsonify({
            "status": "success",
            "message": "Orden de compra rechazada.",
            "orden": formatear_orden_por_rol(orden_db, rol_usuario)
            })

    except Exception as e:
        db.session.rollback()
        print(f"ERROR: Excepción inesperada al rechazar orden {orden_id}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al rechazar la orden"}), 500


# --- Endpoint: Recibir Mercadería de Orden de Compra ---
@compras_bp.route('/recibir/<int:orden_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN']) # Permitir a ADMIN y ALMACEN recibir 
def recibir_orden_compra(current_user, orden_id):
    """
    Registra la recepción de mercadería, actualiza cantidades y llama a actualizar costos.
    Payload esperado (JSON):
    {
        "nro_remito_proveedor": "R-001-12345",
        "estado_recepcion": "Parcial" | "Completa" | ...,
        "items_recibidos": [
            {
             "id_linea": <id_detalle_oc_existente>, # O "producto_codigo": "CODIGO"
             "cantidad_recibida": 450.0,
             "costo_unitario_ars": 12.34, # <-- COSTO ARS REAL de esta recepción
             "notas_item": "Caja abierta" (opcional)
             }, ...
        ],
        "notas_recepcion_general": "...", (opcional)
        "recibido_por": "Nombre Apellido" (opcional, tomar de auth si no)
        // --- Datos de Pago/Costo (Opcional, usualmente cargado por     ADMIN) ---
        "ajuste_tc": true | false, (opcional)
        "importe_cc": 1500.50, (opcional)
        "dif_ajuste_cambio": -50.25, (opcional)
        "importe_abonado": 25000.00, (opcional)
        "forma_pago": "Cheque" | ..., (opcional)
        "cheque_perteneciente_a": "..." (opcional)
    }
    """
    print(f"\n--- INFO: Recibida solicitud PUT en /ordenes_compra/{orden_id}/recibir ---")
    rol_usuario = request.headers.get("X-User-Role", "almacen")
    usuario_receptor_header = request.headers.get("X-User-Name", "Sistema") # Desde header
    data = request.json

    if not data: return jsonify({"error": "Payload JSON vacío"}), 400

    # --- Validaciones de Cabecera ---
    nro_remito = data.get('nro_remito_proveedor')
    estado_recepcion_payload = data.get('estado_recepcion')
    items_recibidos_payload = data.get('items_recibidos')
    recibido_por = data.get('recibido_por', usuario_receptor_header) # Tomar del payload o header

    if not nro_remito: return jsonify({"error": "Falta 'nro_remito_proveedor'"}), 400
    if not estado_recepcion_payload or estado_recepcion_payload not in ESTADOS_RECEPCION:
        return jsonify({"error": f"Valor inválido para 'estado_recepcion'."}), 400
    if not items_recibidos_payload or not isinstance(items_recibidos_payload, list):
         return jsonify({"error": "'items_recibidos' debe ser una lista"}), 400

    # --- Obtener Orden y Validar Estado ---
    try:
        # Cargar orden y sus items/productos relacionados para evitar N+1 queries después
        orden_db = db.session.query(OrdenCompra).options(
            db.selectinload(OrdenCompra.items).selectinload(DetalleOrdenCompra.producto)
        ).get(orden_id)

        if not orden_db: return jsonify({"error": "Orden de compra no encontrada"}), 404

        # Permitir recibir solo si está Aprobada (o Parcialmente Recibida si implementas multi-recepción)
        if orden_db.estado not in ['Aprobado', 'Parcialmente Recibido', 'Con Deuda']: # Ajustar si soportas múltiples recepciones
            return jsonify({"error": f"Solo se puede recibir mercadería de órdenes 'Aprobadas'. Estado actual: {orden_db.estado}"}), 409 # Conflict

        # --- Procesar Items Recibidos ---
        # Mapa para buscar detalles existentes por ID o por producto_id/codigo
        detalles_existentes_map = {detalle.id: detalle for detalle in orden_db.items}
        productos_procesados_costo = set() # Para no actualizar costo del mismo producto varias veces en una llamada

        for item_recibido_data in items_recibidos_payload:
            id_linea = item_recibido_data.get('id_linea') # Preferir ID de línea si viene
            codigo_prod = item_recibido_data.get('producto_codigo') # Alternativa si no viene ID
            cantidad_rec_str = item_recibido_data.get('cantidad_recibida')
            costo_ars_str = str(item_recibido_data.get('costo_unitario_ars', '')).replace(',','.') # Costo de esta recepción
            notas_item = item_recibido_data.get('notas_item')

            # Encontrar el detalle de la orden correspondiente
            detalle_orden_db = None
            if id_linea is not None:
                detalle_orden_db = detalles_existentes_map.get(id_linea)
            elif codigo_prod:
                # Buscar por código si no hay ID (menos preciso si el mismo producto está varias veces)
                for det in orden_db.items:
                    if det.producto and det.producto.id == codigo_prod:
                        detalle_orden_db = det
                        break # Tomar el primero que coincida

            if not detalle_orden_db:
                 msg = f"No se encontró la línea de detalle para ID '{id_linea}' o Código '{codigo_prod}' en la orden."
                 print(f"WARN: {msg}")
                 # Decide si fallar o continuar (por ahora fallamos)
                 # return jsonify({"error": msg}), 400
                 # OJO: Esto no maneja items EXTRA no solicitados. Requiere lógica adicional.
                 print(f"WARN: Ignorando item recibido no encontrado en la orden: ID={id_linea}, Cod={codigo_prod}")
                 continue


            # Validar y convertir cantidad y costo
            try:
                cantidad_recibida = cantidad_rec_str
                # Costo ARS es opcional en el payload? Si no viene, no actualizamos costo ref USD.
                costo_unitario_ars = Decimal(costo_ars_str) if costo_ars_str else None
                if cantidad_recibida < 0: raise ValueError("Cantidad recibida no puede ser negativa")
                if costo_unitario_ars is not None and costo_unitario_ars < 0: raise ValueError("Costo ARS no puede ser negativo")
            except (ValueError, InvalidOperation) as e:
                return jsonify({"error": f"Cantidad ({cantidad_rec_str}) o Costo ARS ({costo_ars_str}) inválido para línea ID {detalle_orden_db.id}: {e}"}), 400

            # --- Actualizar Detalle de la Orden ---
            # Lógica de recepción múltiple (si aplica): sumar a lo existente? O reemplazar?
            # Por ahora, reemplazamos o asignamos si es la primera vez.
            detalle_orden_db.cantidad_recibida = cantidad_recibida
            detalle_orden_db.notas_item_recepcion = notas_item
            # Guardar el costo ARS de esta recepción específica en el detalle (NUEVO CAMPO REQUERIDO en DetalleOrdenCompra?)
            # detalle_orden_db.costo_unitario_recepcion_ars = costo_unitario_ars # Si existe el campo

            # --- Disparar Actualización de Costo de Referencia (si aplica) ---
            producto_actual = detalle_orden_db.producto
            if (costo_unitario_ars is not None and
                producto_actual and
                not producto_actual.es_receta and
                producto_actual.id not in productos_procesados_costo):

                print(f"--- [Recibir OC] Preparando para actualizar costo de Producto ID: {producto_actual.id} ({producto_actual.codigo_interno}) con ARS {costo_unitario_ars}")
                try:
                    # *** LLAMADA AL ENDPOINT DE ACTUALIZACIÓN DE COSTO ***
                    update_url = f"{BASE_API_URL}/productos/{producto_actual.id}/actualizar_costo_compra"
                    update_payload = {"costo_recepcion_ars": str(costo_unitario_ars)}
                    # Considerar Headers si el endpoint de productos requiere autenticación
                    update_response = requests.post(update_url, json=update_payload, headers=request.headers, timeout=15) # Reenviar headers? O usar uno específico?

                    if update_response.status_code == 200:
                        print(f"--- [Recibir OC] Costo de referencia para {producto_actual.codigo_interno} actualizado OK.")
                        productos_procesados_costo.add(producto_actual.id) # Marcar como procesado
                    else:
                        # Falló la actualización, loggear pero continuar con la recepción?
                        print(f"WARN: Falló la llamada para actualizar costo de {producto_actual.codigo_interno}. Status: {update_response.status_code}")
                        print(f"WARN: Respuesta: {update_response.text}")
                        # Podrías decidir si esto es un error fatal para la recepción o no.

                except requests.exceptions.RequestException as req_err:
                     # Error de red al llamar al endpoint de productos
                     print(f"ERROR: Falla de red al llamar a actualizar_costo_compra para {producto_actual.codigo_interno}: {req_err}")
                     # Considerar si esto debe detener la recepción.
                except Exception as call_err:
                     # Otro error inesperado
                     print(f"ERROR: Inesperado al llamar a actualizar_costo_compra para {producto_actual.codigo_interno}: {call_err}")

        # --- Actualizar Cabecera de la Orden ---
        # Determinar estado final (podría ser más complejo si hay multi-recepción)
        # Simplificado: Si se recibió algo, pasa a Recibido (o Parcial si se indica)
        # Una lógica mejor compararía total recibido vs solicitado para todos los items.
        if orden_db.importe_total_estimado == Decimal(str(data['importe_abonado'])):
            orden_db.estado = 'Recibido' if estado_recepcion_payload in ['Completa', 'Extra', 'Con Daños'] else 'Parcialmente Recibido'
            for item in orden_db.items:
                if item.producto and item.precio_unitario_estimado is not None:
                    item.producto.costo_referencia_usd = item.precio_unitario_estimado
        else:
            orden_db.estado = 'Con Deuda' if estado_recepcion_payload in ['Completa', 'Extra', 'Con Daños'] else 'Parcialmente Recibido'
            orden_db.fecha_recepcion = datetime.datetime.utcnow() # O tomar fecha del payload?
            orden_db.recibido_por = recibido_por
            orden_db.nro_remito_proveedor = nro_remito
            orden_db.estado_recepcion = estado_recepcion_payload
            orden_db.notas_recepcion = data.get('notas_recepcion_general')
        # fecha_actualizacion se actualiza via onupdate

        # --- Actualizar Datos de Pago/Costo en la Orden (si vienen y rol es ADMIN) ---
        if rol_usuario == "ADMIN":
            # Convertir 'SI'/'NO' a boolean si es necesario
            ajuste_tc_payload = data.get('ajuste_tc')
            if ajuste_tc_payload is not None:
                 orden_db.ajuste_tc = str(ajuste_tc_payload).upper() == 'SI' # O True/False directamente

            forma_pago_payload = data.get('forma_pago')
            if forma_pago_payload:
                 if forma_pago_payload not in FORMAS_PAGO:
                     return jsonify({"error": f"Forma de pago '{forma_pago_payload}' inválida."}), 400
                 orden_db.forma_pago = forma_pago_payload

            try:
                # Convertir a Decimal o Float asegurando que sean números si vienen
                orden_db.importe_abonado = Decimal(str(data['importe_abonado'])) if 'importe_abonado' in data else orden_db.importe_abonado
            except (ValueError, TypeError, InvalidOperation) as e:
                 db.session.rollback()
                 return jsonify({"error": f"Error en campos numéricos de pago/costo (importe_cc, dif_ajuste_cambio, importe_abonado): {e}"}), 400

            orden_db.cheque_perteneciente_a = data.get('cheque_perteneciente_a') if orden_db.forma_pago == 'Cheque' else None
            print(f"--- DEBUG: Datos de pago/costo de orden actualizados por rol '{rol_usuario}'")

        # --- Commit Final ---
        db.session.commit()
        print(f"--- INFO: Orden {orden_id} registrada como recibida. Estado final: {orden_db.estado}")

        return jsonify({
            "status": "success",
            "message": "Mercadería registrada como recibida.",
            "orden": formatear_orden_por_rol(orden_db, rol_usuario) # Devolver estado final
            })

    except Exception as e:
        db.session.rollback()
        print(f"ERROR: Excepción inesperada al recibir orden {orden_id}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al procesar la recepción"}), 500
