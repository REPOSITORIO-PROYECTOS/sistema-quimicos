from flask import Blueprint, request, jsonify, make_response
from werkzeug.security import generate_password_hash, check_password_hash
from ..models import UsuarioInterno
from app import db
import jwt
import datetime
from app.utils.decorators import token_required
from app.config import Config

auth_bp = Blueprint('auth', __name__, url_prefix='/api')

# --- LOGIN ---
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('nombre_usuario') or not data.get('contrasena'):
        return jsonify({'message': 'Faltan datos'}), 400

    usuario = UsuarioInterno.query.filter_by(nombre_usuario=data['nombre_usuario']).first()

    if not usuario or not check_password_hash(usuario.contrasena, data['contrasena']):
        return jsonify({'message': 'Credenciales inválidas'}), 401

    token = jwt.encode({
        'user_id': usuario.id,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=8)
    }, Config.SECRET_KEY, algorithm='HS256')

    response = make_response(jsonify({'token': token}))
    response.set_cookie('access_token', token, httponly=True, samesite='Lax')
    return response

# --- REGISTRO ---
@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    campos_requeridos = ['nombre', 'apellido', 'nombre_usuario', 'email', 'contrasena', 'rol']
    if not all(k in data for k in campos_requeridos):
        return jsonify({'message': 'Faltan campos obligatorios'}), 400

    if UsuarioInterno.query.filter((UsuarioInterno.email == data['email']) | 
                                   (UsuarioInterno.nombre_usuario == data['nombre_usuario'])).first():
        return jsonify({'message': 'Usuario o email ya registrados'}), 409

    hashed_pass = generate_password_hash(data['contrasena'])

    nuevo_usuario = UsuarioInterno(
        nombre=data['nombre'],
        apellido=data['apellido'],
        nombre_usuario=data['nombre_usuario'],
        email=data['email'],
        contrasena=hashed_pass,
        rol=data['rol']
    )

    db.session.add(nuevo_usuario)
    db.session.commit()

    return jsonify({'message': 'Usuario registrado con éxito'}), 201

# --- EDITAR PERFIL ---
@auth_bp.route('/editar-perfil', methods=['PUT'])
@token_required
def editar_perfil(usuario):
    data = request.get_json()

    usuario.nombre = data.get('nombre', usuario.nombre)
    usuario.apellido = data.get('apellido', usuario.apellido)
    usuario.email = data.get('email', usuario.email)

    if data.get('contrasena'):
        usuario.contrasena = generate_password_hash(data['contrasena'])

    db.session.commit()

    return jsonify({'message': 'Perfil actualizado'}), 200

# --- LOGOUT ---
@auth_bp.route('/logout', methods=['POST'])
def logout():
    response = make_response(jsonify({'message': 'Sesión cerrada'}))
    response.set_cookie('access_token', '', expires=0)
    return response
