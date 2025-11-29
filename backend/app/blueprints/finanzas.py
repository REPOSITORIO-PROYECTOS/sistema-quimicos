from flask import Blueprint, request, jsonify
from decimal import Decimal, InvalidOperation
from sqlalchemy import func
from .. import db
from ..models import MovimientoProveedor, Proveedor, OrdenCompra
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES

finanzas_bp = Blueprint('finanzas', __name__, url_prefix='/finanzas')

def _deuda_proveedor(proveedor_id: int) -> Decimal:
    debitos = db.session.query(func.coalesce(func.sum(MovimientoProveedor.monto), 0)).filter(
        MovimientoProveedor.proveedor_id == proveedor_id,
        MovimientoProveedor.tipo == 'DEBITO'
    ).scalar() or Decimal('0')
    creditos = db.session.query(func.coalesce(func.sum(MovimientoProveedor.monto), 0)).filter(
        MovimientoProveedor.proveedor_id == proveedor_id,
        MovimientoProveedor.tipo == 'CREDITO'
    ).scalar() or Decimal('0')
    return Decimal(str(debitos)) - Decimal(str(creditos))

@finanzas_bp.route('/transacciones/registrar', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['CONTABLE'])
def registrar_transaccion(current_user):
    data = request.get_json() or {}
    proveedor_id = data.get('proveedor_id')
    tipo = (data.get('tipo') or '').upper()
    orden_id = data.get('orden_id')
    descripcion = data.get('descripcion')
    usuario = data.get('usuario')
    permitir_debito_con_deuda = bool(data.get('permitir_debito_con_deuda', False))
    if tipo not in ('DEBITO', 'CREDITO'):
        return jsonify({'error': 'Tipo inválido. Use DEBITO o CREDITO'}), 400
    if not isinstance(proveedor_id, int):
        return jsonify({'error': 'proveedor_id inválido'}), 400
    prov = db.session.get(Proveedor, proveedor_id)
    if not prov:
        return jsonify({'error': 'Proveedor no encontrado'}), 404
    try:
        monto = Decimal(str(data.get('monto', '0')))
        if monto < 0:
            return jsonify({'error': 'El monto no puede ser negativo'}), 400
    except (InvalidOperation, TypeError):
        return jsonify({'error': 'Monto inválido'}), 400
    if tipo == 'DEBITO' and not permitir_debito_con_deuda:
        deuda_actual = _deuda_proveedor(proveedor_id)
        if deuda_actual > 0:
            return jsonify({'error': 'Transacción bloqueada: el proveedor tiene deuda pendiente', 'deuda_actual': float(deuda_actual)}), 409
    oc = db.session.get(OrdenCompra, orden_id) if isinstance(orden_id, int) else None
    mov = MovimientoProveedor(
        proveedor_id=proveedor_id,
        orden_id=oc.id if oc else None,
        tipo=tipo,
        monto=monto,
        descripcion=descripcion,
        usuario=usuario
    )
    db.session.add(mov)
    db.session.commit()
    return jsonify({'message': 'Transacción registrada', 'movimiento_id': mov.id}), 201

@finanzas_bp.route('/movimientos', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['CONTABLE'])
def listar_movimientos(current_user):
    tipo = request.args.get('tipo')
    fecha_desde = request.args.get('fecha_desde')
    fecha_hasta = request.args.get('fecha_hasta')
    q = db.session.query(MovimientoProveedor).order_by(MovimientoProveedor.fecha.desc())
    if tipo in ('DEBITO', 'CREDITO'):
        q = q.filter(MovimientoProveedor.tipo == tipo)
    if fecha_desde:
        try:
            from datetime import datetime
            fd = datetime.fromisoformat(fecha_desde)
            q = q.filter(MovimientoProveedor.fecha >= fd)
        except Exception:
            pass
    if fecha_hasta:
        try:
            from datetime import datetime
            fh = datetime.fromisoformat(fecha_hasta)
            q = q.filter(MovimientoProveedor.fecha <= fh)
        except Exception:
            pass
    movimientos = q.all()
    total_debitos = sum([float(m.monto) for m in movimientos if m.tipo == 'DEBITO'])
    total_creditos = sum([float(m.monto) for m in movimientos if m.tipo == 'CREDITO'])
    return jsonify({
        'movimientos': [
            {
                'id': m.id,
                'proveedor_id': m.proveedor_id,
                'orden_id': m.orden_id,
                'tipo': m.tipo,
                'monto': float(m.monto),
                'fecha': m.fecha.isoformat() if m.fecha else None,
                'descripcion': m.descripcion,
                'usuario': m.usuario
            } for m in movimientos
        ],
        'totales': {
            'debitos': total_debitos,
            'creditos': total_creditos,
            'neto': total_creditos - total_debitos
        }
    })

@finanzas_bp.route('/dashboard', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['CONTABLE'])
def dashboard_financiero(current_user):
    proveedores = db.session.query(Proveedor).all()
    resumen = []
    deuda_total = Decimal('0')
    pagos_total = Decimal('0')
    for p in proveedores:
        deuda = _deuda_proveedor(p.id)
        deuda_total += deuda if deuda > 0 else Decimal('0')
        pagos = db.session.query(func.coalesce(func.sum(MovimientoProveedor.monto), 0)).filter(
            MovimientoProveedor.proveedor_id == p.id,
            MovimientoProveedor.tipo == 'CREDITO'
        ).scalar() or Decimal('0')
        pagos_total += Decimal(str(pagos))
        resumen.append({
            'proveedor_id': p.id,
            'proveedor_nombre': p.nombre,
            'deuda': float(deuda),
            'estado': 'ROJO' if deuda > 0 else 'VERDE'
        })
    pendientes_destacados = sorted([r for r in resumen if r['deuda'] > 0], key=lambda x: x['deuda'], reverse=True)[:5]
    return jsonify({
        'estado_general': 'OK' if deuda_total == 0 else 'ALERTA_DEUDAS',
        'deuda_total': float(deuda_total),
        'pagos_total': float(pagos_total),
        'pendientes_destacados': pendientes_destacados,
        'resumen_proveedores': resumen
    })

