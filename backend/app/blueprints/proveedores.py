# app/blueprints/proveedores.py

from flask import Blueprint, request, jsonify
from models import db, Proveedor  # Importamos desde el models.py raíz
from sqlalchemy.exc import IntegrityError
import traceback # Para logs de errores más detallados

# Creamos el Blueprint
# url_prefix es clave para organizar las rutas de la API.
proveedores_bp = Blueprint('proveedores_bp', __name__, url_prefix='/proveedores')


# [CREATE] Crear un nuevo proveedor
# Endpoint: POST /api/v1/proveedores
@proveedores_bp.route('/crear', methods=['POST'])
def crear_proveedor():
    """
    Crea un nuevo proveedor.
    Espera un JSON en el cuerpo con los datos del proveedor.
    Ejemplo de payload:
    {
        "nombre": "Proveedor Estrella S.A.",
        "cuit": "30-12345678-9",
        "direccion": "Calle Falsa 123",
        "telefono": "555-1234",
        "email": "contacto@proveedorestrella.com",
        "contacto": "Juan Perez",
        "condiciones_pago": "30 días fecha factura"
    }
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No se recibió payload JSON'}), 400
    
    nombre = data.get('nombre')
    cuit = data.get('cuit') # CUIT es opcional en el modelo, pero si se provee, se valida unicidad

    if not nombre:
        return jsonify({'error': 'El campo "nombre" es requerido'}), 400

    # Verificar si ya existe un proveedor con el mismo nombre
    if Proveedor.query.filter(Proveedor.nombre.ilike(nombre)).first(): # Búsqueda case-insensitive
        return jsonify({'error': f"El proveedor con nombre '{nombre}' ya existe"}), 409 # Conflict
    
    # Verificar si ya existe un proveedor con el mismo CUIT (si se proporcionó)
    if cuit and Proveedor.query.filter_by(cuit=cuit).first():
        return jsonify({'error': f"El proveedor con CUIT '{cuit}' ya existe"}), 409 # Conflict

    try:
        nuevo_proveedor = Proveedor(
            nombre=nombre,
            cuit=cuit,
            direccion=data.get('direccion'),
            telefono=data.get('telefono'),
            email=data.get('email'),
            contacto=data.get('contacto'),
            condiciones_pago=data.get('condiciones_pago')
        )
        db.session.add(nuevo_proveedor)
        db.session.commit()
        return jsonify(nuevo_proveedor.to_dict()), 201 # Created
    except IntegrityError as e:
        db.session.rollback()
        # Este error podría ocurrir si hay otra constraint de unicidad no manejada explícitamente antes
        print(f"IntegrityError al crear proveedor: {e.orig}") # Log para el servidor
        return jsonify({'error': 'Error de integridad de base de datos. ¿Datos duplicados?', 'detalle': str(e.orig)}), 409
    except Exception as e:
        db.session.rollback()
        print(f"Error inesperado al crear proveedor: {traceback.format_exc()}") # Log completo del error
        return jsonify({'error': 'Ocurrió un error inesperado al crear el proveedor'}), 500

# [READ] Obtener todos los proveedores
# Endpoint: GET /api/v1/proveedores
# También podría aceptar parámetros de paginación o filtros (ej. ?nombre=...)
@proveedores_bp.route('/obtener-todos', methods=['GET'])
def obtener_proveedores():
    """Obtiene una lista de todos los proveedores."""
    try:
        # Aquí podrías agregar lógica para filtros y paginación
        # Ejemplo: page = request.args.get('page', 1, type=int)
        # Ejemplo: per_page = request.args.get('per_page', 10, type=int)
        # proveedores_paginados = Proveedor.query.paginate(page=page, per_page=per_page, error_out=False)
        # proveedores = proveedores_paginados.items
        # return jsonify({
        #     'proveedores': [p.to_dict() for p in proveedores],
        #     'total': proveedores_paginados.total,
        #     'pages': proveedores_paginados.pages,
        #     'current_page': proveedores_paginados.page
        # }), 200
        
        proveedores = Proveedor.query.order_by(Proveedor.nombre).all()
        return jsonify([p.to_dict() for p in proveedores]), 200
    except Exception as e:
        print(f"Error inesperado al obtener proveedores: {traceback.format_exc()}")
        return jsonify({'error': 'Ocurrió un error inesperado al obtener los proveedores'}), 500

# [READ] Obtener un proveedor específico por ID
# Endpoint: GET /api/v1/proveedores/<proveedor_id>
@proveedores_bp.route('/obtener/<int:proveedor_id>', methods=['GET'])
def obtener_proveedor_por_id(proveedor_id):
    """Obtiene un proveedor específico por su ID."""
    proveedor = Proveedor.query.get(proveedor_id)
    if proveedor:
        return jsonify(proveedor.to_dict()), 200
    else:
        return jsonify({'error': 'Proveedor no encontrado'}), 404

# [UPDATE] Actualizar un proveedor existente
# Endpoint: PUT /api/v1/proveedores/<proveedor_id>
@proveedores_bp.route('/editar/<int:proveedor_id>', methods=['PUT'])
def actualizar_proveedor(proveedor_id):
    """
    Actualiza un proveedor existente.
    Espera un JSON en el cuerpo con los campos a actualizar.
    """
    proveedor = Proveedor.query.get(proveedor_id)
    if not proveedor:
        return jsonify({'error': 'Proveedor no encontrado'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No se recibió payload JSON para actualizar'}), 400

    # Verificar unicidad de nombre si se está cambiando y no es el nombre actual del proveedor
    nuevo_nombre = data.get('nombre')
    if nuevo_nombre and nuevo_nombre != proveedor.nombre and \
       Proveedor.query.filter(Proveedor.nombre.ilike(nuevo_nombre)).filter(Proveedor.id != proveedor_id).first():
        return jsonify({'error': f"Otro proveedor ya existe con el nombre '{nuevo_nombre}'"}), 409

    # Verificar unicidad de CUIT si se está cambiando y no es el CUIT actual del proveedor
    nuevo_cuit = data.get('cuit')
    if nuevo_cuit and nuevo_cuit != proveedor.cuit and \
       Proveedor.query.filter_by(cuit=nuevo_cuit).filter(Proveedor.id != proveedor_id).first():
        return jsonify({'error': f"Otro proveedor ya existe con el CUIT '{nuevo_cuit}'"}), 409
    
    try:
        # Actualizar campos si se proporcionan en el payload
        if 'nombre' in data: proveedor.nombre = data['nombre']
        if 'cuit' in data: proveedor.cuit = data['cuit'] # Permitir poner CUIT a None si se envía explícitamente
        if 'direccion' in data: proveedor.direccion = data['direccion']
        if 'telefono' in data: proveedor.telefono = data['telefono']
        if 'email' in data: proveedor.email = data['email']
        if 'contacto' in data: proveedor.contacto = data['contacto']
        if 'condiciones_pago' in data: proveedor.condiciones_pago = data['condiciones_pago']
        
        db.session.commit()
        return jsonify(proveedor.to_dict()), 200
    except IntegrityError as e:
        db.session.rollback()
        print(f"IntegrityError al actualizar proveedor: {e.orig}")
        return jsonify({'error': 'Error de integridad de base de datos al actualizar.', 'detalle': str(e.orig)}), 409
    except Exception as e:
        db.session.rollback()
        print(f"Error inesperado al actualizar proveedor: {traceback.format_exc()}")
        return jsonify({'error': 'Ocurrió un error inesperado al actualizar el proveedor'}), 500

# [DELETE] Eliminar un proveedor
# Endpoint: DELETE /api/v1/proveedores/<proveedor_id>
@proveedores_bp.route('/eliminar/<int:proveedor_id>', methods=['DELETE'])
def eliminar_proveedor(proveedor_id):
    """Elimina un proveedor por su ID."""
    proveedor = Proveedor.query.get(proveedor_id)
    if not proveedor:
        return jsonify({'error': 'Proveedor no encontrado'}), 404

    try:
        # Consideración importante: ¿Qué pasa si el proveedor tiene órdenes de compra asociadas?
        # Opción 1: Prevenir la eliminación (como se muestra comentado abajo)
        # Opción 2: Eliminar en cascada (configurar en el modelo SQLAlchemy con cascade="all, delete-orphan")
        # Opción 3: Poner el proveedor_id en las órdenes a NULL (configurar con ondelete='SET NULL')

        from app.models import OrdenCompra # Si tienes el modelo OrdenCompra
        if OrdenCompra.query.filter_by(proveedor_id=proveedor_id).first():
            return jsonify({'error': 'No se puede eliminar el proveedor, tiene órdenes de compra asociadas. Considere desactivarlo o reasignar las órdenes.'}), 409

        db.session.delete(proveedor)
        db.session.commit()
        # Si decides no eliminar en cascada, puedes simplemente devolver un 204 No Content
        return jsonify({'mensaje': 'Proveedor eliminado correctamente'}), 200
    except IntegrityError as e: # Podría ocurrir si hay FKs que previenen el delete y no se manejaron antes
        db.session.rollback()
        print(f"IntegrityError al eliminar proveedor: {e.orig}")
        return jsonify({'error': 'Error de integridad de base de datos al eliminar. ¿Tiene elementos asociados?', 'detalle': str(e.orig)}), 409
    except Exception as e:
        db.session.rollback()
        print(f"Error inesperado al eliminar proveedor: {traceback.format_exc()}")
        return jsonify({'error': 'Ocurrió un error inesperado al eliminar el proveedor'}), 500

# [DELETE] Eliminar un proveedor por nombre
# Endpoint: DELETE /api/v1/proveedores/nombre/<nombre>  
@proveedores_bp.route('/eliminar-por-nombre/<string:nombre>', methods=['DELETE'])
def eliminar_proveedor_por_nombre(nombre):
    """Elimina un proveedor por su nombre."""
    proveedor = Proveedor.query.filter(Proveedor.nombre.ilike(nombre)).first()
    if not proveedor:
        return jsonify({'error': 'Proveedor no encontrado'}), 404

    try:
        db.session.delete(proveedor)
        db.session.commit()
        return jsonify({'mensaje': 'Proveedor eliminado correctamente'}), 200
    except IntegrityError as e:
        db.session.rollback()
        print(f"IntegrityError al eliminar proveedor por nombre: {e.orig}")
        return jsonify({'error': 'Error de integridad de base de datos al eliminar. ¿Tiene elementos asociados?', 'detalle': str(e.orig)}), 409
    except Exception as e:
        db.session.rollback()
        print(f"Error inesperado al eliminar proveedor por nombre: {traceback.format_exc()}")
        return jsonify({'error': 'Ocurrió un error inesperado al eliminar el proveedor'}), 500

# [PATCH] Desactivar un proveedor
# Endpoint: PATCH /api/v1/proveedores/<proveedor_id>/desactivar
@proveedores_bp.route('/desactivar/<int:proveedor_id>/desactivar', methods=['PATCH'])
def desactivar_proveedor(proveedor_id):
    """Desactiva un proveedor por su ID."""
    proveedor = Proveedor.query.get(proveedor_id)
    if not proveedor:
        return jsonify({'error': 'Proveedor no encontrado'}), 404

    try:
        proveedor.activo = False
        db.session.commit()
        return jsonify({'mensaje': 'Proveedor desactivado correctamente'}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error inesperado al desactivar proveedor: {traceback.format_exc()}")
        return jsonify({'error': 'Ocurrió un error inesperado al desactivar el proveedor'}), 500

# [PATCH] Activar un proveedor
# Endpoint: PATCH /api/v1/proveedores/<proveedor_id>/activar
@proveedores_bp.route('/activar/<int:proveedor_id>/activar', methods=['PATCH'])
def activar_proveedor(proveedor_id):
    """Activa un proveedor por su ID."""
    proveedor = Proveedor.query.get(proveedor_id)
    if not proveedor:
        return jsonify({'error': 'Proveedor no encontrado'}), 404

    try:
        proveedor.activo = True
        db.session.commit()
        return jsonify({'mensaje': 'Proveedor activado correctamente'}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error inesperado al activar proveedor: {traceback.format_exc()}")
        return jsonify({'error': 'Ocurrió un error inesperado al activar el proveedor'}), 500

# [PATCH] Cambiar el estado de un proveedor
# Endpoint: PATCH /api/v1/proveedores/<proveedor_id>/estado
@proveedores_bp.route('/cambiar-estado/<int:proveedor_id>/estado', methods=['PATCH'])
def cambiar_estado_proveedor(proveedor_id):
    """Cambia el estado de un proveedor por su ID."""
    proveedor = Proveedor.query.get(proveedor_id)
    if not proveedor:
        return jsonify({'error': 'Proveedor no encontrado'}), 404

    data = request.get_json()
    if not data or 'estado' not in data:
        return jsonify({'error': 'No se recibió payload JSON para actualizar el estado'}), 400

    nuevo_estado = data['estado']
    if nuevo_estado not in ['activo', 'inactivo']:
        return jsonify({'error': 'El estado debe ser "activo" o "inactivo"'}), 400

    try:
        proveedor.activo = (nuevo_estado == 'activo')
        db.session.commit()
        return jsonify({'mensaje': f'Proveedor {"activado" if nuevo_estado == "activo" else "desactivado"} correctamente'}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error inesperado al cambiar estado de proveedor: {traceback.format_exc()}")
        return jsonify({'error': 'Ocurrió un error inesperado al cambiar el estado del proveedor'}), 500
    
# [search] Buscar proveedores por nombre
# Endpoint: GET /api/v1/proveedores/buscar
@proveedores_bp.route('/buscar', methods=['GET'])
def buscar_proveedores():
    """Busca proveedores por nombre."""
    nombre = request.args.get('nombre')
    if not nombre:
        return jsonify({'error': 'El parámetro "nombre" es requerido para la búsqueda'}), 400

    try:
        proveedores = Proveedor.query.filter(Proveedor.nombre.ilike(f'%{nombre}%')).all()
        return jsonify([p.to_dict() for p in proveedores]), 200
    except Exception as e:
        print(f"Error inesperado al buscar proveedores: {traceback.format_exc()}")
        return jsonify({'error': 'Ocurrió un error inesperado al buscar proveedores'}), 500
    
# [search] Buscar proveedores por CUIT
# Endpoint: GET /api/v1/proveedores/buscar/cuit
@proveedores_bp.route('/buscar/cuit', methods=['GET'])
def buscar_proveedor_por_cuit():
    """Busca un proveedor por su CUIT."""
    cuit = request.args.get('cuit')
    if not cuit:
        return jsonify({'error': 'El parámetro "cuit" es requerido para la búsqueda'}), 400

    try:
        proveedor = Proveedor.query.filter(Proveedor.cuit.ilike(f'%{cuit}%')).first()
        if proveedor:
            return jsonify(proveedor.to_dict()), 200
        else:
            return jsonify({'error': 'Proveedor no encontrado'}), 404
    except Exception as e:
        print(f"Error inesperado al buscar proveedor por CUIT: {traceback.format_exc()}")
        return jsonify({'error': 'Ocurrió un error inesperado al buscar el proveedor por CUIT'}), 500
    
