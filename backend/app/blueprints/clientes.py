from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES
      
# blueprints/clientes.py

from flask import Blueprint, request, jsonify
from app import cache
from datetime import datetime, timezone # Asegúrate de importar datetime y timezone si no lo haces globalmente
from .. import db # Ajusta esta importación según la estructura de tu proyecto (donde inicializas db)
from ..models import Cliente, PrecioEspecialCliente
from sqlalchemy.orm import joinedload
import pandas as pd
import io
import traceback
from sqlalchemy import or_

clientes_bp = Blueprint('clientes', __name__, url_prefix='/clientes')

# --- Helper Function ---
def cliente_a_diccionario(cliente):
    """Convierte un objeto Cliente de SQLAlchemy a un diccionario serializable."""
    if not cliente:
        return None
    return {
        'id': cliente.id,
        'nombre_razon_social': cliente.nombre_razon_social,
        'cuit': cliente.cuit,
        'direccion': cliente.direccion,
        'localidad': cliente.localidad,
        'provincia': cliente.provincia,
        'codigo_postal': cliente.codigo_postal,
        'telefono': cliente.telefono,
        'email': cliente.email,
        'contacto_principal': cliente.contacto_principal,
        'condicion_iva': cliente.condicion_iva,
        'lista_precio_asignada': cliente.lista_precio_asignada,
        'observaciones': cliente.observaciones,
        # Convierte datetime a string ISO 8601 para JSON
        'fecha_alta': cliente.fecha_alta.isoformat() if cliente.fecha_alta else None,
        'activo': cliente.activo
        # No incluimos 'ventas' aquí para evitar recursión o carga pesada.
        # Se podría crear otro endpoint para obtener las ventas de un cliente.
    }

# --- Rutas CRUD ---

# CREATE - Crear un nuevo cliente
@clientes_bp.route('/crear', methods=['POST'])
def crear_cliente():
    """Crea un nuevo cliente."""
    data = request.get_json()

    if not data or not data.get('nombre_razon_social'):
        return jsonify({"error": "El campo 'nombre_razon_social' es obligatorio."}), 400

    # Validación opcional de CUIT único si se proporciona
    if data.get('cuit'):
        cliente_existente = Cliente.query.filter_by(cuit=data['cuit']).first()
        if cliente_existente:
            return jsonify({"error": f"Ya existe un cliente con el CUIT {data['cuit']}."}), 409 # 409 Conflict

    try:
        nuevo_cliente = Cliente(
            nombre_razon_social=data['nombre_razon_social'],
            cuit=data.get('cuit'),
            direccion=data.get('direccion'),
            localidad=data.get('localidad'),
            provincia=data.get('provincia'),
            codigo_postal=data.get('codigo_postal'),
            telefono=data.get('telefono'),
            email=data.get('email'),
            contacto_principal=data.get('contacto_principal'),
            condicion_iva=data.get('condicion_iva'),
            lista_precio_asignada=data.get('lista_precio_asignada'),
            observaciones=data.get('observaciones'),
            # fecha_alta se establece por defecto
            activo=data.get('activo', True) # Por defecto activo si no se especifica
        )
        db.session.add(nuevo_cliente)
        db.session.commit()
        return jsonify(cliente_a_diccionario(nuevo_cliente)), 201 # 201 Created
    except Exception as e:
        db.session.rollback()
        # Considera loggear el error 'e' aquí
        return jsonify({"error": "Error al crear el cliente.", "detalle": str(e)}), 500

# READ - Obtener todos los clientes (o filtrar por activos/inactivos)
@clientes_bp.route('/obtener_todos', methods=['GET'])
# Hacer que la caché respete los parámetros de consulta (page, per_page, search_term)
# para evitar devolver siempre la misma página cuando cambian los parámetros.
@cache.cached(timeout=180, query_string=True)
def obtener_clientes():
    """
    [ACTUALIZADO] Obtiene una lista de clientes con filtros, paginación y BÚSQUEDA.
    """
    try:
        # --- Parámetros de la URL (el nuevo es 'search_term') ---
        page = request.args.get('page', default=1, type=int)
        per_page = request.args.get('per_page', default=20, type=int)
        search_term = request.args.get('search_term', default=None, type=str)
        # Debug: logear parámetros para diagnóstico
        try:
            print(f"[obtener_clientes] params -> page={page}, per_page={per_page}, search_term={search_term}")
        except Exception:
            pass
        
        # Por defecto, solo muestra activos
        query = Cliente.query.filter_by(activo=True)

        # Filtro de búsqueda por search_term
        if search_term:
            like_term = f"%{search_term}%"
            query = query.filter(
                Cliente.nombre_razon_social.ilike(like_term) |
                Cliente.localidad.ilike(like_term) |
                Cliente.email.ilike(like_term) |
                Cliente.cuit.ilike(like_term) |
                Cliente.contacto_principal.ilike(like_term)
            )

        query = query.order_by(Cliente.nombre_razon_social)
        paginated_clientes = query.paginate(page=page, per_page=per_page, error_out=False)
        try:
            print(f"[obtener_clientes] paginated -> page={paginated_clientes.page}, total={paginated_clientes.total}")
        except Exception:
            pass
        clientes_db = paginated_clientes.items
        clientes_list = [cliente_a_diccionario(c) for c in clientes_db]

        return jsonify({
            "clientes": clientes_list,
            "pagination": {
                "total_items": paginated_clientes.total,
                "total_pages": paginated_clientes.pages,
                "current_page": page,
                "per_page": per_page,
                "has_next": paginated_clientes.has_next,
                "has_prev": paginated_clientes.has_prev
            }
        }), 200

    except Exception as e:
        # traceback.print_exc() # Descomentar para depuración si es necesario
        return jsonify({"error": "Error interno al obtener los clientes"}), 500



# READ - Obtener un cliente específico por ID
@clientes_bp.route('/obtener/<int:cliente_id>', methods=['GET'])
def obtener_cliente(cliente_id):
    """Obtiene un cliente por su ID."""
    # Usamos get_or_404 para manejar automáticamente el caso de no encontrarlo
    cliente = Cliente.query.get_or_404(cliente_id)
    return jsonify(cliente_a_diccionario(cliente)), 200

# UPDATE - Actualizar un cliente existente por ID
@clientes_bp.route('/actualizar/<int:cliente_id>', methods=['PUT', 'PATCH']) 
@token_required
@roles_required(ROLES['ADMIN'], ROLES['CONTABLE'], ROLES['VENTAS_PEDIDOS'])
def actualizar_cliente(current_user, cliente_id):
    """Actualiza un cliente existente."""
    cliente = Cliente.query.get_or_404(cliente_id)
    data = request.get_json()

    if not data:
        return jsonify({"error": "No se proporcionaron datos para actualizar."}), 400

    # Validación opcional de CUIT único si se está cambiando
    nuevo_cuit = data.get('cuit')
    if nuevo_cuit and nuevo_cuit != cliente.cuit:
        cliente_existente = Cliente.query.filter(Cliente.cuit == nuevo_cuit, Cliente.id != cliente_id).first()
        if cliente_existente:
             return jsonify({"error": f"Ya existe otro cliente con el CUIT {nuevo_cuit}."}), 409

    try:
        # Actualizar campos proporcionados en data
        for key, value in data.items():
            # Evitar actualizar campos protegidos como id o fecha_alta directamente
            if hasattr(cliente, key) and key not in ['id', 'fecha_alta']:
                setattr(cliente, key, value)

        db.session.commit()
        return jsonify(cliente_a_diccionario(cliente)), 200
    except Exception as e:
        db.session.rollback()
        # Considera loggear el error 'e' aquí
        return jsonify({"error": "Error al actualizar el cliente.", "detalle": str(e)}), 500

# DELETE - Marcar un cliente como inactivo (Soft Delete)
@clientes_bp.route('/desactivar/<int:cliente_id>', methods=['DELETE'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['CONTABLE'])
def desactivar_cliente(current_user, cliente_id):
    """Marca un cliente como inactivo (Soft Delete)."""
    cliente = Cliente.query.get_or_404(cliente_id)

    if not cliente.activo:
         return jsonify({"mensaje": "El cliente ya está inactivo."}), 200 # O 400 Bad Request si prefieres

    try:
        cliente.activo = False
        db.session.commit()
        return jsonify({"mensaje": f"Cliente ID:{cliente_id} marcado como inactivo."}), 200 # O 204 No Content
    except Exception as e:
        db.session.rollback()
        # Considera loggear el error 'e' aquí
        return jsonify({"error": "Error al desactivar el cliente.", "detalle": str(e)}), 500

# --- Opcional: Ruta para reactivar un cliente ---
@clientes_bp.route('/reactivar/<int:cliente_id>', methods=['POST'])
def reactivar_cliente(cliente_id):
    """Reactiva un cliente previamente marcado como inactivo."""
    cliente = Cliente.query.get_or_404(cliente_id)

    if cliente.activo:
         return jsonify({"mensaje": "El cliente ya está activo."}), 200 # O 400 Bad Request

    try:
        cliente.activo = True
        db.session.commit()
        return jsonify({"mensaje": f"Cliente ID:{cliente_id} reactivado.", "cliente": cliente_a_diccionario(cliente)}), 200
    except Exception as e:
        db.session.rollback()
        # Considera loggear el error 'e' aquí
        return jsonify({"error": "Error al reactivar el cliente.", "detalle": str(e)}), 500

@clientes_bp.route('/cargar_csv', methods=['POST'])
def cargar_clientes_desde_csv():
    """
    Crea o actualiza clientes masivamente desde un archivo CSV.
    El archivo debe ser enviado como 'multipart/form-data' con la clave 'archivo_clientes'.
    Columnas esperadas: 'NOMBRE', 'TELEFONO', 'DIRECCIÓN', 'LOCALIDAD'.
    Utiliza el NOMBRE como clave única para buscar y actualizar.
    """
    if 'archivo_clientes' not in request.files:
        return jsonify({"error": "No se encontró el archivo en la solicitud. Usa la clave 'archivo_clientes'."}), 400

    file = request.files['archivo_clientes']
    if file.filename == '':
        return jsonify({"error": "No se seleccionó ningún archivo."}), 400

    try:
        # --- 1. PREPARACIÓN: Cargar clientes existentes en un diccionario para búsqueda rápida ---
        clientes_existentes = {c.nombre_razon_social.strip().upper(): c for c in Cliente.query.all()}
        
        # --- 2. LECTURA Y PROCESAMIENTO DEL CSV ---
        df = pd.read_csv(io.StringIO(file.stream.read().decode("utf-8-sig")), keep_default_na=False) # keep_default_na=False para no convertir celdas vacías en NaN
        
        registros_creados = 0
        registros_actualizados = 0
        errores = []

        for index, row in df.iterrows():
            nombre_csv = str(row.get('NOMBRE', '')).strip()
            telefono_csv = str(row.get('TELEFONO', '')).strip()
            direccion_csv = str(row.get('DIRECCIÓN', '')).strip()
            localidad_csv = str(row.get('LOCALIDAD', '')).strip()

            if not nombre_csv:
                # Opcional: podrías decidir saltar filas sin nombre en lugar de dar error
                errores.append(f"Fila {index + 2}: El campo 'NOMBRE' está vacío.")
                continue

            nombre_upper = nombre_csv.upper()
            cliente_existente = clientes_existentes.get(nombre_upper)

            if cliente_existente:
                # --- ACTUALIZAR CLIENTE EXISTENTE ---
                # Actualiza solo si la información del CSV es más completa
                cliente_existente.telefono = telefono_csv if telefono_csv else cliente_existente.telefono
                cliente_existente.direccion = direccion_csv if direccion_csv else cliente_existente.direccion
                cliente_existente.localidad = localidad_csv if localidad_csv else cliente_existente.localidad
                cliente_existente.activo = True # Se reactiva si estaba inactivo
                registros_actualizados += 1
            else:
                # --- CREAR NUEVO CLIENTE ---
                nuevo_cliente = Cliente(
                    nombre_razon_social=nombre_csv,
                    telefono=telefono_csv,
                    direccion=direccion_csv,
                    localidad=localidad_csv,
                    activo=True
                )
                db.session.add(nuevo_cliente)
                registros_creados += 1
        
        # --- 3. COMMIT Y RESPUESTA ---
        if errores:
            db.session.rollback()
            return jsonify({
                "error": "El proceso falló debido a errores en el archivo. No se realizó ningún cambio.",
                "detalles_errores": errores
            }), 400
        else:
            db.session.commit()
            return jsonify({
                "message": "Carga de clientes completada exitosamente.",
                "clientes_creados": registros_creados,
                "clientes_actualizados": registros_actualizados,
                "total_filas_procesadas": len(df)
            }), 200

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": "Ocurrió un error inesperado durante el proceso de carga.", "detalle": str(e)}), 500
    
# READ - Buscar todos los clientes activos por nombre/email/localidad/cuit/contacto (sin paginación)
@clientes_bp.route('/buscar_todos', methods=['GET'])
def buscar_todos_clientes():
    """
    Devuelve todos los clientes activos que coincidan con el search_term (sin paginación).
    Uso recomendado solo para búsquedas masivas (modal, selectores, etc).
    """
    try:
        search_term = request.args.get('search_term', default=None, type=str)
        query = Cliente.query.filter_by(activo=True)
        if search_term:
            like_term = f"%{search_term}%"
            query = query.filter(
                Cliente.nombre_razon_social.ilike(like_term) |
                Cliente.localidad.ilike(like_term) |
                Cliente.email.ilike(like_term) |
                Cliente.cuit.ilike(like_term) |
                Cliente.contacto_principal.ilike(like_term)
            )
        query = query.order_by(Cliente.nombre_razon_social)
        clientes_db = query.all()
        clientes_list = [cliente_a_diccionario(c) for c in clientes_db]
        return jsonify({"clientes": clientes_list, "total": len(clientes_list)}), 200
    except Exception as e:
        return jsonify({"error": "Error interno al buscar clientes", "detalle": str(e)}), 500


# READ - Obtener clientes junto con sus precios especiales (paginado o all=true)
@clientes_bp.route('/obtener_todos_con_precios', methods=['GET'])
def obtener_clientes_con_precios():
    """
    Devuelve clientes (paginado por defecto) e incluye una lista `precios_especiales`
    por cliente con los precios especiales activos.

    Parámetros:
      - page, per_page: paginación (opcional)
      - search_term: filtro por nombre/localidad/email/cuit/contacto
      - all=true : devuelve todos los matches (ignora paginación)
    """
    try:
        page = request.args.get('page', default=1, type=int)
        per_page = request.args.get('per_page', default=20, type=int)
        search_term = request.args.get('search_term', default=None, type=str)
        all_flag = request.args.get('all', default='false', type=str).lower() == 'true'

        query = Cliente.query.filter_by(activo=True)
        if search_term:
            like_term = f"%{search_term}%"
            query = query.filter(
                Cliente.nombre_razon_social.ilike(like_term) |
                Cliente.localidad.ilike(like_term) |
                Cliente.email.ilike(like_term) |
                Cliente.cuit.ilike(like_term) |
                Cliente.contacto_principal.ilike(like_term)
            )

        query = query.order_by(Cliente.nombre_razon_social)

        if all_flag:
            clientes_db = query.all()
            pagination = None
        else:
            paginated = query.paginate(page=page, per_page=per_page, error_out=False)
            clientes_db = paginated.items
            pagination = {
                'total_items': paginated.total,
                'total_pages': paginated.pages,
                'current_page': paginated.page,
                'per_page': paginated.per_page,
                'has_next': paginated.has_next,
                'has_prev': paginated.has_prev,
            }

        clientes_list = [cliente_a_diccionario(c) for c in clientes_db]

        # Obtener precios especiales activos para los clientes cargados (solo una query)
        cliente_ids = [c['id'] for c in clientes_list]
        precios_map = {cid: [] for cid in cliente_ids}
        if cliente_ids:
            precios_q = PrecioEspecialCliente.query.options(joinedload(PrecioEspecialCliente.producto)).filter(
                PrecioEspecialCliente.cliente_id.in_(cliente_ids), PrecioEspecialCliente.activo == True
            ).all()
            for p in precios_q:
                prod_nombre = None
                try:
                    prod_nombre = p.producto.nombre if p.producto else None
                except Exception:
                    prod_nombre = None
                precios_map.setdefault(p.cliente_id, []).append({
                    'id': p.id,
                    'producto_id': p.producto_id,
                    'producto_nombre': prod_nombre,
                    'precio_unitario_fijo_ars': float(p.precio_unitario_fijo_ars) if p.precio_unitario_fijo_ars is not None else None,
                    'activo': bool(p.activo)
                })

        # Adjuntar precios a cada cliente
        for c in clientes_list:
            c['precios_especiales'] = precios_map.get(c['id'], [])

        resp = { 'clientes': clientes_list }
        if pagination is not None:
            resp['pagination'] = pagination

        return jsonify(resp), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Error interno al obtener clientes con precios", "detalle": str(e)}), 500
    
    