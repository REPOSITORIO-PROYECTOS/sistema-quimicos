from functools import wraps
from flask import request, jsonify
from ..models import UsuarioInterno
import jwt

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        # Intenta desde Authorization header
        if 'Authorization' in request.headers:
            bearer = request.headers['Authorization']
            token = bearer.split(" ")[1] if " " in bearer else bearer

        # Si no está en el header, intenta desde la cookie
        if not token:
            token = request.cookies.get('access_token')

        if not token:
            return jsonify({'message': 'Token requerido'}), 401

        try:
            data = jwt.decode(token, 'J2z8KJdN8UfU8g6wKXgk4Q6nfsDF8wMnezLp8xsdWbNQqZ4RkOzZulX8wA==', algorithms=['HS256'])
            current_user = UsuarioInterno.query.get(data['user_id'])
        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token expirado'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Token inválido'}), 401

        return f(current_user, *args, **kwargs)
    return decorated


def roles_required(*required_roles):
    """
    Decorador para verificar roles de usuario. Usar DESPUÉS de @token_required.
    Permite el acceso si el rol del usuario está en la lista de roles requeridos.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(current_user, *args, **kwargs): # Recibe current_user de token_required
            if not current_user or not hasattr(current_user, 'rol'):
                 return jsonify({'message': 'Error interno: Usuario no identificado para verificar rol'}), 500

            user_role = current_user.rol # Asume que el campo se llama 'rol'

            if user_role not in required_roles:
                return jsonify({
                    'message': 'Permiso denegado: Rol no autorizado.',
                    'roles_permitidos': list(required_roles),
                    'tu_rol': user_role
                }), 403 # Forbidden
            # Si el rol es correcto, continúa
            return f(current_user, *args, **kwargs)
        return decorated_function
    return decorator
