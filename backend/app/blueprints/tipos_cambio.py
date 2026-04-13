# blueprints/tipos_cambio.py
from flask import Blueprint, request, jsonify
from ..models import TipoCambio
from decimal import Decimal, InvalidOperation
import traceback
from .. import db

# --- Imports de Seguridad ---
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES # Importar diccionario de roles

tipos_cambio_bp = Blueprint('tipos_cambio', __name__, url_prefix='/api/tipos_cambio')


def _estado_upper(estado):
    return str(estado or '').strip().upper()


def _recalcular_deuda_oc_en_ars(orden_db, tc_actualizado):
    """Recalcula el DEBITO usando la misma regla que el módulo de compras (ARS según TC de la orden)."""
    try:
        from ..blueprints.compras import _actualizar_movimiento_deuda

        # `tc_actualizado` ya se asignó en `oc.tc_transaccion` antes de llamar aquí.
        _actualizar_movimiento_deuda(
            orden_db,
            usuario_actualiza="Sistema",
            descripcion=(
                f"OC {orden_db.id} - Deuda recalculada por actualización de dólar compras "
                f"(TC {tc_actualizado})"
            ),
        )
    except Exception:
        # No cortar el proceso masivo por una orden puntual.
        pass


def _actualizar_ocs_pendientes_por_dolar(nuevo_valor):
    """Actualiza tc_transaccion y deuda para OCs abiertas en USD."""
    from ..models import OrdenCompra

    # Solo excluir anuladas: en RECIBIDO puede seguir habiendo deuda en USD y debe
    # expresarse en ARS según el DolarCompras vigente (no dejar montos "congelados").
    estados_excluidos = {'RECHAZADO', 'CANCELADO', 'CANCELADA'}
    ocs = OrdenCompra.query.filter(
        OrdenCompra.ajuste_tc.is_(True)
    ).all()

    ocs_actualizadas = 0
    deudas_recalculadas = 0

    for oc in ocs:
        if _estado_upper(getattr(oc, 'estado', None)) in estados_excluidos:
            continue

        oc.tc_transaccion = nuevo_valor
        ocs_actualizadas += 1
        _recalcular_deuda_oc_en_ars(oc, nuevo_valor)
        deudas_recalculadas += 1

    return ocs_actualizadas, deudas_recalculadas

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
    nombre_upper = str(nombre).strip().upper()
    # Alias "USD" (frontend antiguo) y lectura de "DolarCompras" si aún no está dado de alta en BD.
    if not tc and nombre_upper in ('USD', 'DOLARCOMPRAS'):
        tc = (
            TipoCambio.query.filter_by(nombre='DolarCompras').first()
            or TipoCambio.query.filter_by(nombre='Oficial').first()
            or TipoCambio.query.filter_by(nombre='Empresa').first()
        )
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

        ocs_actualizadas = 0
        deudas_recalculadas = 0
        if str(nombre).strip().upper() in {'DOLARCOMPRAS', 'OFICIAL', 'USD'}:
            ocs_actualizadas, deudas_recalculadas = _actualizar_ocs_pendientes_por_dolar(nuevo_valor)

        db.session.commit()

        return jsonify({
            "tipo_cambio": tipo_cambio_a_dict(tc),
            "precios_usd_actualizados": actualizados,
            "ordenes_compra_tc_actualizadas": ocs_actualizadas,
            "ordenes_compra_deuda_recalculada": deudas_recalculadas
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
