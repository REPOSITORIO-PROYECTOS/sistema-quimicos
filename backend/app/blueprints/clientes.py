      
# blueprints/clientes.py

from flask import Blueprint, request, jsonify
from datetime import datetime, timezone # Asegúrate de importar datetime y timezone si no lo haces globalmente
from .. import db # Ajusta esta importación según la estructura de tu proyecto (donde inicializas db)
from ..models import Cliente # Ajusta esta importación según dónde esté tu modelo Cliente

# Crea el Blueprint
# 'clientes_api' es el nombre del blueprint
# __name__ ayuda a Flask a localizar recursos
# url_prefix añade '/api/v1/clientes' antes de todas las rutas definidas en este blueprint
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
def obtener_clientes():
    """Obtiene una lista de clientes. Permite filtrar por estado activo y aplicar paginación."""
    try:
        mostrar_activos = request.args.get('activos', default='true', type=str).lower() == 'true'

        query = Cliente.query

        if mostrar_activos:
            query = query.filter_by(activo=True)
        else:
            query = query.filter_by(activo=False)

        query = query.order_by(Cliente.nombre_razon_social)

        # --- Paginación ---
        page = request.args.get('page', default=1, type=int)
        per_page = request.args.get('per_page', default=20, type=int)

        paginated_clientes = query.paginate(page=page, per_page=per_page, error_out=False)
        clientes_db = paginated_clientes.items

        # Serialización
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
        print(f"ERROR [obtener_clientes]: Excepción inesperada")
        traceback.print_exc()
        return jsonify({"error": "Error interno al obtener los clientes"}), 500

# def obtener_clientes():
#     """Obtiene una lista de clientes. Permite filtrar por estado activo."""
#     mostrar_activos = request.args.get('activos', default='true', type=str).lower() == 'true'

#     if mostrar_activos:
#         clientes = Cliente.query.filter_by(activo=True).order_by(Cliente.nombre_razon_social).all()
#     else:
#         # Si quieres poder ver *todos* (activos e inactivos), podrías tener otro parámetro
#         # o simplemente quitar el filtro si 'activos' no es 'true'.
#         # Aquí mostramos solo los inactivos si activos=false.
#         clientes = Cliente.query.filter_by(activo=False).order_by(Cliente.nombre_razon_social).all()
#         # O para obtener TODOS:
#         # clientes = Cliente.query.order_by(Cliente.nombre_razon_social).all()


#     return jsonify([cliente_a_diccionario(c) for c in clientes]), 200

# READ - Obtener un cliente específico por ID
@clientes_bp.route('/obtener/<int:cliente_id>', methods=['GET'])
def obtener_cliente(cliente_id):
    """Obtiene un cliente por su ID."""
    # Usamos get_or_404 para manejar automáticamente el caso de no encontrarlo
    cliente = Cliente.query.get_or_404(cliente_id)
    return jsonify(cliente_a_diccionario(cliente)), 200

# UPDATE - Actualizar un cliente existente por ID
@clientes_bp.route('/actualizar/<int:cliente_id>', methods=['PUT', 'PATCH']) # Soportamos PUT y PATCH
def actualizar_cliente(cliente_id):
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
def desactivar_cliente(cliente_id):
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

    