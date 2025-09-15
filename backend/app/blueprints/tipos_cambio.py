# blueprints/tipos_cambio.py
from flask import Blueprint, request, jsonify
from ..models import db, TipoCambio # Ajusta import
from decimal import Decimal, InvalidOperation
import traceback
from .. import db

# --- Imports de Seguridad ---
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES # Importar diccionario de roles

tipos_cambio_bp = Blueprint('tipos_cambio', __name__, url_prefix='/tipos_cambio')

@tipos_cambio_bp.route('/crear', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'])
def crear_tipo_cambio(current_user):
    data = request.get_json()
    if not data or not data.get('nombre') or 'valor' not in data:
        return jsonify({"error": "Faltan 'nombre' o 'valor'"}), 400

    nombre = data['nombre']
    if TipoCambio.query.filter_by(nombre=nombre).first():
        return jsonify({"error": f"Tipo de cambio '{nombre}' ya existe"}), 409

    try:
        valor = Decimal(str(data['valor']))
        if valor <= 0:
             return jsonify({"error": "El valor debe ser positivo"}), 400

        nuevo_tc = TipoCambio(nombre=nombre, valor=valor)
        db.session.add(nuevo_tc)
        db.session.commit()
        return jsonify(tipo_cambio_a_dict(nuevo_tc)), 201
    except (ValueError, TypeError, InvalidOperation):
        db.session.rollback()
        return jsonify({"error": "Valor inválido"}), 400
    except Exception as e:
        db.session.rollback()
        print(f"Error creando tipo de cambio: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno"}), 500

@tipos_cambio_bp.route('/obtener_todos', methods=['GET'])
def obtener_tipos_cambio():
    tipos = TipoCambio.query.order_by(TipoCambio.nombre).all()
    return jsonify([tipo_cambio_a_dict(tc) for tc in tipos])

@tipos_cambio_bp.route('/obtener/<string:nombre>', methods=['GET'])
def obtener_tipo_cambio_por_nombre(nombre):
    # Usar .first() y manejar None, o .one() y capturar NoResultFound
    tc = TipoCambio.query.filter_by(nombre=nombre).first()
    if not tc:
        return jsonify({"error": f"Tipo de cambio '{nombre}' no encontrado"}), 404
    return jsonify(tipo_cambio_a_dict(tc))

@tipos_cambio_bp.route('/actualizar/<string:nombre>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN'])
def actualizar_tipo_cambio(current_user, nombre):
    tc = TipoCambio.query.filter_by(nombre=nombre).first()
    if not tc:
        return jsonify({"error": f"Tipo de cambio '{nombre}' no encontrado"}), 404

    data = request.get_json()
    if not data or 'valor' not in data:
         return jsonify({"error": "Falta el campo 'valor'"}), 400

    try:
        nuevo_valor = Decimal(str(data['valor']))
        if nuevo_valor <= 0:
            return jsonify({"error": "El valor debe ser positivo"}), 400

        tc.valor = nuevo_valor
        db.session.commit()

        # --- Actualizar precios especiales en USD ---
        from ..models import PrecioEspecialCliente
        precios_usd = PrecioEspecialCliente.query.filter_by(moneda_original='USD').all()
        actualizados = 0
        for p in precios_usd:
            if p.precio_original is not None:
                try:
                    nuevo_precio_ars = Decimal(str(p.precio_original)) * nuevo_valor
                    p.precio_unitario_fijo_ars = nuevo_precio_ars
                    p.tipo_cambio_usado = nuevo_valor
                    actualizados += 1
                except Exception as e:
                    print(f"Error actualizando precio especial ID {p.id}: {e}")
        db.session.commit()

        return jsonify({
            "tipo_cambio": tipo_cambio_a_dict(tc),
            "precios_usd_actualizados": actualizados
        })
    except (ValueError, TypeError, InvalidOperation):
        db.session.rollback()
        return jsonify({"error": "Valor inválido"}), 400
    except Exception as e:
        db.session.rollback()
        print(f"Error actualizando tipo de cambio {nombre}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno"}), 500

@tipos_cambio_bp.route('/eliminar/<string:nombre>', methods=['DELETE'])
@token_required
@roles_required(ROLES['ADMIN'])
def eliminar_tipo_cambio(current_user, nombre):
    tc = TipoCambio.query.filter_by(nombre=nombre).first()
    if not tc:
        return jsonify({"error": f"Tipo de cambio '{nombre}' no encontrado"}), 404

    # Validar si se puede borrar? (ej: no borrar 'USD' o 'ARS' si son base?)
    # if nombre in ['USD', 'ARS']: return jsonify({"error": "No se puede borrar tipo base"}), 400

    try:
        db.session.delete(tc)
        db.session.commit()
        return jsonify({"message": f"Tipo de cambio '{nombre}' eliminado"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error eliminando tipo de cambio {nombre}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno"}), 500

def tipo_cambio_a_dict(tc):
    return {
        "id": tc.id,
        "nombre": tc.nombre,
        "valor": float(tc.valor) if tc.valor is not None else None,
        "fecha_actualizacion": tc.fecha_actualizacion.isoformat() if tc.fecha_actualizacion else None
    }
