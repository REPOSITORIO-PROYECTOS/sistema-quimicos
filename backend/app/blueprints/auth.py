# app/blueprints/auth.py

from flask import Blueprint, request, jsonify, make_response, current_app
from werkzeug.security import generate_password_hash, check_password_hash
# Ajustar imports desde la raíz de 'app'
from .. import db
from ..models import UsuarioInterno # Asegúrate que UsuarioInterno tenga campo 'activo' y métodos check/set_password (opcional)
import jwt
import datetime
import traceback # Para logging
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES

# Ajustar import de decoradores desde 'utils'
from ..utils.decorators import token_required, roles_required
# (Opcional) Importar roles definidos
# Asumiremos que los roles son strings simples por ahora
# Ejemplo: ROLES_PERMITIDOS = ['    ADMINistrador general', 'vendedor de pedidos', ...]

auth_bp = Blueprint('auth', __name__, url_prefix='/auth') # Mantenemos prefijo /auth

# --- LOGIN ---
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('nombre_usuario') or not data.get('contrasena'):
        return jsonify({'message': 'Faltan nombre de usuario o contraseña'}), 400

    try:
        # Buscar usuario activo
        usuario = UsuarioInterno.query.filter_by(nombre_usuario=data['nombre_usuario']).first()

        # Verificar contraseña
        if not usuario or not check_password_hash(usuario.contrasena, data['contrasena']):
             # Usar check_password_hash directamente es seguro
             return jsonify({'message': 'Credenciales inválidas o usuario inactivo'}), 401

        # Generar Token JWT
        payload = {
            'user_id': usuario.id,
            'rol': usuario.rol,
            'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=8) # Expiración
        }
        secret_key = 'J2z8KJdN8UfU8g6wKXgk4Q6nfsDF8wMnezLp8xsdWbNQqZ4RkOzZulX8wA==' #current_app.config.get('SECRET_KEY')
        if not secret_key:
            print("ERROR FATAL: SECRET_KEY no configurada./prueba")
            return jsonify({'message': 'Error de configuración'}), 500

        token = jwt.encode(payload, secret_key, algorithm='HS256')

        # Devolver token y datos básicos en el cuerpo JSON
        response_data = {
            'message': 'Login exitoso',
            'token': token,
            'user_info': {
                'id': usuario.id,
                'nombre_usuario': usuario.nombre_usuario,
                'nombre': usuario.nombre,
                'apellido': usuario.apellido,
                'rol': usuario.rol,
                'email': usuario.email
            }
        }
        return jsonify(response_data), 200

    except Exception as e:
         print(f"ERROR [login]: Excepción inesperada")
         traceback.print_exc()
         return jsonify({'message': 'Error interno durante el login'}), 500


# --- REGISTRO ---
# Asumiendo que SOLO     ADMINistradores pueden registrar nuevos usuarios
@auth_bp.route('/register', methods=['POST'])
#@token_required
#@roles_required('ADMINistrador general') # Ajusta el string del rol si es diferente
def register(): # Recibe el     ADMIN que está haciendo el registro
    """Registra un nuevo usuario (solo accesible por     ADMINistradores)."""
    data = request.get_json()
    campos_requeridos = ['nombre', 'apellido', 'nombre_usuario', 'email', 'contrasena', 'rol']
    if not data or not all(k in data and data[k] for k in campos_requeridos):
        return jsonify({'message': 'Faltan campos obligatorios o están vacíos'}), 400

    # --- Validación de Datos (Dentro de la función) ---
    # Validar rol permitido (puedes tener una lista en config)
    roles_validos = ["ADMIN", "ALMACEN", "VENTAS_LOCAL", "VENTAS_PEDIDOS", "CONTABLE"]
    if data['rol'].strip() not in roles_validos:
        return jsonify({'message': f"Rol '{data['rol']}' inválido. Roles permitidos: {', '.join(roles_validos)}"}), 400

    # Validar email y contraseña
    email = data['email'].strip().lower()
    if '@' not in email or '.' not in email.split('@')[-1]: return jsonify({'message': 'Formato de email inválido'}), 400
    if len(data['contrasena']) < 8: return jsonify({'message': 'La contraseña debe tener al menos 8 caracteres'}), 400

    # Verificar duplicados
    nombre_usuario = data['nombre_usuario'].strip()
    if UsuarioInterno.query.filter(
        (UsuarioInterno.email == email) | (UsuarioInterno.nombre_usuario == nombre_usuario)
        ).first():
        return jsonify({'message': 'Nombre de usuario o email ya registrados'}), 409

    # --- Creación de Usuario ---
    try:
        hashed_pass = generate_password_hash(data['contrasena'])
        nuevo_usuario = UsuarioInterno(
            nombre=data['nombre'].strip(),
            apellido=data['apellido'].strip(),
            nombre_usuario=nombre_usuario,
            email=email,
            contrasena=hashed_pass,
            rol=data['rol'].strip(),
#            activo=True # Activo por defecto
        )
        db.session.add(nuevo_usuario)
        db.session.commit()

#        print(f"INFO [auth]: Usuario {current_ADMIN_user.nombre_usuario} registró a {nuevo_usuario.nombre_usuario} (Rol: {nuevo_usuario.rol})")
        # Devolver info básica del usuario creado
        return jsonify({
            'message': 'Usuario registrado con exitooo',
            'user': {'id': nuevo_usuario.id, 'nombre_usuario': nuevo_usuario.nombre_usuario, 'rol': nuevo_usuario.rol}
            }), 201
    except Exception as e:
        db.session.rollback()
        print(f"ERROR [register]: Excepción al registrar usuario {nombre_usuario}")
        traceback.print_exc()
        return jsonify({'message': 'Error interno al registrar usuario'}), 500


# --- OBTENER PERFIL PROPIO ---
@auth_bp.route('/profile', methods=['GET'])
@token_required # Protegido
def get_profile(current_user):
    """Devuelve la información del usuario autenticado."""
    fecha_creacion_iso = None
    if hasattr(current_user, 'fecha_creacion') and current_user.fecha_creacion:
        try:
            fecha_creacion_iso = current_user.fecha_creacion.isoformat()
        except AttributeError: # Por si acaso no es un objeto datetime válido
            fecha_creacion_iso = str(current_user.fecha_creacion)

    return jsonify({
        'id': current_user.id,
        'nombre_usuario': current_user.nombre_usuario,
        'nombre': current_user.nombre,
        'apellido': current_user.apellido,
        'email': current_user.email,
        'rol': current_user.rol,
        'activo': current_user.activo,
        'fecha_creacion': fecha_creacion_iso
    }), 200


# --- EDITAR PERFIL PROPIO ---
@auth_bp.route('/profile', methods=['PUT'])
@token_required # Protegido
def editar_perfil(current_user):
    """Permite al usuario autenticado editar su propio perfil."""
    data = request.get_json()
    if not data: return jsonify({'message': 'No se enviaron datos'}), 400

    try:
        updated_fields = [] # Para loggear qué se cambió

        # Campos editables
        if 'nombre' in data and data['nombre'].strip() != current_user.nombre:
            current_user.nombre = data['nombre'].strip()
            updated_fields.append('nombre')
        if 'apellido' in data and data['apellido'].strip() != current_user.apellido:
            current_user.apellido = data['apellido'].strip()
            updated_fields.append('apellido')

        # Validar y actualizar email
        if 'email' in data and data['email'].strip().lower() != current_user.email:
            nuevo_email = data['email'].strip().lower()
            if '@' not in nuevo_email or '.' not in nuevo_email.split('@')[-1]: return jsonify({'message': 'Email inválido'}), 400
            if UsuarioInterno.query.filter(UsuarioInterno.id != current_user.id, UsuarioInterno.email == nuevo_email).first():
                 return jsonify({'message': 'El nuevo email ya está en uso'}), 409
            current_user.email = nuevo_email
            updated_fields.append('email')

        # Cambiar contraseña
        if data.get('contrasena'):
            nueva_contrasena = data['contrasena']
            if len(nueva_contrasena) < 8: return jsonify({'message': 'Contraseña muy corta (min 8 caracteres)'}), 400
            # Usar generate_password_hash directamente es seguro
            current_user.contrasena = generate_password_hash(nueva_contrasena)
            updated_fields.append('contrasena')

        if not updated_fields:
             return jsonify({'message': 'No se proporcionaron datos para actualizar'}), 304 # Not Modified

        db.session.commit()
        print(f"INFO [auth]: Perfil actualizado para usuario ID {current_user.id}. Campos: {', '.join(updated_fields)}")
        # Devolver perfil actualizado
        return jsonify({
            'message': 'Perfil actualizado con éxito',
            'user': {
                 'id': current_user.id, 'nombre_usuario': current_user.nombre_usuario,
                 'nombre': current_user.nombre, 'apellido': current_user.apellido,
                 'email': current_user.email, 'rol': current_user.rol
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"ERROR [editar_perfil]: Excepción al actualizar perfil para usuario ID {current_user.id}")
        traceback.print_exc()
        return jsonify({'message': 'Error interno al actualizar perfil'}), 500


# --- LOGOUT ---
@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Limpia la cookie de sesión 'access_token' si se usa."""
    response = make_response(jsonify({'message': 'Sesión cerrada (cookie eliminada si existe)'}))
    response.set_cookie('access_token', '', expires=0, httponly=True, samesite='Lax', secure=not current_app.debug)
    print("INFO [auth]: Logout llamado, cookie 'access_token' eliminada.")
    return response

# --- Endpoint de Verificación de Token ---
@auth_bp.route('/verify_token', methods=['GET'])
@token_required
def verify_token(current_user):
    """Endpoint protegido para verificar si el token actual es válido."""
    return jsonify({'message': 'Token válido', 'user_id': current_user.id, 'rol': current_user.rol}), 200
