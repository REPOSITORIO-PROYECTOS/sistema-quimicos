# app/blueprints/compras.py

from flask import Blueprint, request, jsonify
from .. import db # Importar db desde app/__init__.py
# Importar TODOS los modelos necesarios desde app/models.py
from ..models import OrdenCompra, DetalleOrdenCompra, Producto, Proveedor, TipoCambio, AuditLog, MovimientoProveedor
# Importar funciones de cálculo si son necesarias (aunque actualizar costo se llama via endpoint)
# from .productos import actualizar_costo_desde_compra # Podría llamarse directo si se refactoriza
from decimal import Decimal, InvalidOperation, DivisionByZero
import logging
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES
import datetime
import uuid # Sigue siendo útil si usas UUIDs para IDs de OrdenCompra
import traceback
import requests # Necesario para llamar al endpoint de actualizar costo
import json

#hola

# --- Configuración ---
# Obtener la URL base de la app actual o definirla. OJO: esto puede ser problemático.
# Es MEJOR pasar la URL base o usar una configuración central.
# Por ahora, asumimos que corre en localhost:5000. ¡¡AJUSTAR SI ES NECESARIO!!
BASE_API_URL = "http://localhost:8001"


# Crear el Blueprint
compras_bp = Blueprint('compras', __name__, url_prefix='/api/ordenes_compra')

# Logger del módulo
logger = logging.getLogger(__name__)


def _convert_to_ars(amount, ajuste_tc_flag, moneda_origen=None):
    """Convierte `amount` (Decimal) a ARS según la moneda origen.
    Si `ajuste_tc_flag` es True (orden en USD) o `moneda_origen` es 'USD', convierte de USD a ARS.
    Si en ARS (ajuste_tc_flag=False o moneda_origen='ARS'), devuelve el monto sin conversión.
    Usa TipoCambio 'Oficial' si está disponible; si falla devuelve el monto sin conversión.
    """
    try:
        if not amount:
            return amount
        amount_dec = Decimal(str(amount))
        # Determinar moneda origen
        es_usd = (moneda_origen == 'USD') or (ajuste_tc_flag is True)
        
        # Si es USD, convertir a ARS usando TC Oficial
        if es_usd:
            from ..models import TipoCambio
            tc = TipoCambio.query.filter_by(nombre='Oficial').first()
            if tc and tc.valor:
                return (amount_dec * Decimal(str(tc.valor))).quantize(Decimal('0.01'))
        return amount_dec.quantize(Decimal('0.01'))
    except Exception:
        return Decimal(str(amount)).quantize(Decimal('0.01'))


def _parse_iibb_rate(iibb_value):
    """Parsea el campo `iibb` que puede ser '3%', '0.03', '3' y devuelve la fracción (ej 0.03).
    Si no puede parsear devuelve Decimal('0').
    """
    try:
        if iibb_value is None:
            return Decimal('0')
        if isinstance(iibb_value, (int, float, Decimal)):
            v = Decimal(str(iibb_value))
            # si <=1 asumimos fracción, si >1 asumimos porcentaje
            return (v if v <= 1 else (v / Decimal('100')))
        s = str(iibb_value).strip()
        if s.endswith('%'):
            s = s[:-1].strip()
            return (Decimal(s) / Decimal('100'))
        # si tiene coma o punto
        v = Decimal(s)
        return (v if v <= 1 else (v / Decimal('100')))
    except Exception:
        return Decimal('0')


def _parse_percentage_rate(value):
    """Normaliza un valor porcentual como fracción decimal (ej. 21 -> 0.21)."""
    try:
        if value is None:
            return Decimal('0')
        raw = str(value).strip()
        if not raw:
            return Decimal('0')
        normalized = raw.replace(',', '.')
        parsed = Decimal(normalized)
        return parsed if parsed <= 1 else (parsed / Decimal('100'))
    except Exception:
        return Decimal('0')


def _recalcular_importe_y_actualizar_deuda(orden_db, usuario_actualiza=None, iva_flag=None, iva_rate=None, iibb_payload=None):
    """Recalcula `importe_total_estimado` de la orden aplicando IVA e IIBB cuando se proveen.
    Luego actualiza (o crea/ajusta) el MovimientoProveedor tipo DEBITO con la deuda restante (convertida a ARS si `ajuste_tc`).
    
    Parámetros:
    - orden_db: Objeto OrdenCompra a actualizar
    - usuario_actualiza: Usuario que realiza la actualización
    - iva_flag: True/False para aplicar IVA; None para no cambiar
    - iva_rate: Tasa de IVA (ej: 0.21 para 21%)
    - iibb_payload: Tasa o valor de IIBB
    
    No hace commit; el llamador debe commitear.
    """
    try:
        # Base debe calcularse a partir de las líneas (sin impuestos) si están disponibles
        try:
            items = getattr(orden_db, 'items', None)
            marker_key = '__BASE_SIN_IMPUESTOS__:'
            obs = orden_db.observaciones_solicitud or ''
            
            # Calcular base desde líneas
            if items and len(items) > 0:
                base = sum([item.importe_linea_estimado or Decimal('0') for item in items])
                # Persistir marcador de base para evitar recalculos errados
                marker = marker_key + str(base)
                if marker_key in obs:
                    # Reemplazar marcador existente
                    parts = [p for p in obs.split('\n') if not p.startswith(marker_key)]
                    parts.append(marker)
                    orden_db.observaciones_solicitud = '\n'.join([p for p in parts if p])
                else:
                    orden_db.observaciones_solicitud = (obs + ('\n' if obs else '') + marker)
            else:
                # Sin items línea: intentar leer base almacenada
                base = None
                if obs and marker_key in obs:
                    try:
                        for part in obs.split('\n'):
                            if part.startswith(marker_key):
                                base = Decimal(part.replace(marker_key, '').strip())
                                break
                    except Exception:
                        base = None
                # Si no hay marcador, usar el importe total actual como base
                if base is None:
                    base = orden_db.importe_total_estimado or Decimal('0')
        except Exception:
            base = orden_db.importe_total_estimado or Decimal('0')
        
        # Calcular impuestos
        iva_amt = Decimal('0')
        if iva_flag is not None:
            # Si iva_flag=True, aplicar IVA; si False, no aplicar
            rate = Decimal(str(iva_rate)) if iva_rate is not None else Decimal('0.21')
            if iva_flag:
                iva_amt = (base * rate).quantize(Decimal('0.01'))
            else:
                iva_amt = Decimal('0')
        else:
            # Si no se especifica, mantener el actual (no cambiar)
            # Para esto, intentar extraer del importe_total_estimado actual
            iva_amt = Decimal('0')  # Conservador: sin cambio
        
        # IIBB
        iibb_amt = Decimal('0')
        if iibb_payload is not None:
            rate_iibb = _parse_iibb_rate(iibb_payload)
            iibb_amt = (base * rate_iibb).quantize(Decimal('0.01'))
        
        nuevo_total = (base + iva_amt + iibb_amt).quantize(Decimal('0.01'))
        orden_db.importe_total_estimado = nuevo_total
        
        # Actualizar deuda: DEBITO debe ser la cantidad adeudada (total - pagado)
        restante = (orden_db.importe_total_estimado or Decimal('0')) - (orden_db.importe_abonado or Decimal('0'))
        restante = restante if restante > Decimal('0') else Decimal('0')
        
        # Buscar movimiento DEBITO existente y actualizarlo
        debito = db.session.query(MovimientoProveedor).filter(
            MovimientoProveedor.orden_id == orden_db.id,
            MovimientoProveedor.tipo == 'DEBITO'
        ).first()
        
        # Convertir deuda a ARS si es necesario
        monto_debito = _convert_to_ars(restante, orden_db.ajuste_tc)
        
        if debito:
            debito.monto = monto_debito
            debito.descripcion = f"OC {orden_db.id} - Deuda recalculada"
        else:
            if monto_debito > Decimal('0'):
                mov = MovimientoProveedor(
                    proveedor_id=orden_db.proveedor_id,
                    orden_id=orden_db.id,
                    tipo='DEBITO',
                    monto=monto_debito,
                    descripcion=f"OC {orden_db.id} - Deuda recalculada",
                    usuario=usuario_actualiza
                )
                db.session.add(mov)
        return True
    except Exception:
        logger.exception("Error recalculando importe y deuda para orden %s", getattr(orden_db, 'id', 'N/A'))
        return False


def _extract_user_info(current_user):
    """Devuelve (id, username, role) intentando soportar dicts y objetos."""
    uid = None
    uname = None
    urole = None
    if not current_user:
        return uid, uname, urole
    try:
        if isinstance(current_user, dict):
            uid = current_user.get('id') or current_user.get('user_id')
            uname = current_user.get('username') or current_user.get('name')
            urole = current_user.get('role')
        else:
            uid = getattr(current_user, 'id', None)
            uname = getattr(current_user, 'nombre_usuario', None) or getattr(current_user, 'nombre', None)
            urole = getattr(current_user, 'rol', None)
    except Exception:
        # no debe romper si la estructura del current_user es inesperada
        return None, None, None
    return uid, uname, urole

# --- Estados Permitidos (usar consistente UPPERCASE) ---
ESTADOS_ORDEN = [
    "SOLICITADO",
    "APROBADO",
    "RECHAZADO",
    "RECIBIDO",
    "CON DEUDA",
    "RECIBIDA_PARCIAL",
    "EN_ESPERA_RECEPCION"
]
ESTADOS_RECEPCION = ["COMPLETA", "PARCIAL", "EXTRA", "CON_DANOS"]
FORMAS_PAGO = ["Cheque", "Efectivo", "Transferencia", "Cuenta Corriente"]


# --- Función Auxiliar para formatear Orden para diferentes Roles ---
# (Adaptada para usar objetos SQLAlchemy y campos del modelo)
# app/blueprints/compras.py

def formatear_orden_por_rol(orden_db, rol="almacen"):
    """Filtra campos sensibles según el rol desde el objeto DB.
    
    Incluye información clara sobre la moneda:
    - ajuste_tc=True o moneda='USD': Orden en dólares (se convierte a ARS en movimientos)
    - ajuste_tc=False o moneda='ARS': Orden en pesos
    """
    if not orden_db: return None

    # Inferir moneda: True -> USD, False -> ARS
    moneda = 'USD' if orden_db.ajuste_tc else 'ARS'

    orden_dict = {
        "id": orden_db.id,
        "nro_solicitud_interno": orden_db.nro_solicitud_interno,
        "nro_remito_proveedor": orden_db.nro_remito_proveedor,
        "ajuste_tc": orden_db.ajuste_tc,
        "moneda": moneda,  # NUEVO: Campo explícito de moneda
        "fecha_creacion": orden_db.fecha_creacion.isoformat() if orden_db.fecha_creacion else None,
        "fecha_actualizacion": orden_db.fecha_actualizacion.isoformat() if orden_db.fecha_actualizacion else None,
        "estado": orden_db.estado,
        "proveedor_id": orden_db.proveedor_id,
        "proveedor_nombre": orden_db.proveedor.nombre if orden_db.proveedor else None,
        "importe_total_estimado": float(orden_db.importe_total_estimado) if orden_db.importe_total_estimado is not None else None,
        "importe_abonado": float(orden_db.importe_abonado) if orden_db.importe_abonado is not None else None,
        "cuenta": orden_db.cuenta,
        "iibb": orden_db.iibb,
        "observaciones_solicitud": orden_db.observaciones_solicitud,
        "cheque_perteneciente_a": orden_db.cheque_perteneciente_a,
        "tipo_caja": orden_db.tipo_caja,
        "fecha_aprobacion": orden_db.fecha_aprobacion.isoformat() if orden_db.fecha_aprobacion else None,
        "aprobado_por": getattr(orden_db, 'aprobador', None) and getattr(orden_db.aprobador, 'nombre_usuario', None) or None,
        "forma_pago": orden_db.forma_pago,
        "fecha_rechazo": orden_db.fecha_rechazo.isoformat() if orden_db.fecha_rechazo else None,
        "motivo_rechazo": orden_db.motivo_rechazo,
        "fecha_recepcion": orden_db.fecha_recepcion.isoformat() if orden_db.fecha_recepcion else None,
        "recibido_por": getattr(orden_db, 'recibido_por_id', None),
        "estado_recepcion": orden_db.estado_recepcion,
        "notas_recepcion": orden_db.notas_recepcion,
        "fecha_entrega_tentativa": None,  # Inicializar para extraer de observaciones
    }

    # Extraer fecha tentativa desde observaciones
    try:
        obs = orden_db.observaciones_solicitud or ''
        marker_key = '__FECHA_ENTREGA_TENTATIVA__:'
        if marker_key in obs:
            part = obs.split(marker_key, 1)[1].strip().splitlines()[0].strip()
            orden_dict['fecha_entrega_tentativa'] = part
    except Exception:
        pass

    # Procesar items
    items_list = []
    items_db = orden_db.items
    if items_db:
        for item_db in items_db:
            item_dict = {
                "id_linea": item_db.id,
                "producto_id": item_db.producto_id,
                "producto_codigo": item_db.producto.id if item_db.producto else 'N/A',
                "producto_nombre": item_db.producto.nombre if item_db.producto else 'N/A',
                "cantidad_solicitada": float(item_db.cantidad_solicitada) if item_db.cantidad_solicitada is not None else None,
                "cantidad_recibida": float(item_db.cantidad_recibida) if item_db.cantidad_recibida is not None else None,
                "notas_item_recepcion": item_db.notas_item_recepcion,
                "precio_unitario_estimado": float(item_db.precio_unitario_estimado) if item_db.precio_unitario_estimado is not None else None,
                "importe_linea_estimado": float(item_db.importe_linea_estimado) if item_db.importe_linea_estimado is not None else None,
                "unidad_medida": item_db.unidad_medida
            }
            items_list.append(item_dict)
    orden_dict["items"] = items_list

    if rol and str(rol).upper() == "ADMIN":
        orden_dict.update({
            "importe_total_estimado": float(orden_db.importe_total_estimado) if orden_db.importe_total_estimado is not None else None,
            "ajuste_tc": orden_db.ajuste_tc,
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
    logger.info("Recibida solicitud POST en /ordenes_compra")
    data = request.get_json()
    # Obtener info real del usuario autenticado
    usuario_solicitante_id, usuario_nombre, rol_usuario = _extract_user_info(current_user)

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
            unidad_medida = item_data.get("unidad_medida")

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
                importe_linea_estimado=importe_linea_estimado,
                unidad_medida=unidad_medida
                # cantidad_recibida se inicializa en None/0 por defecto en el modelo
            )
            detalles_db.append(detalle)

        # Aplicar IVA e IIBB (si vienen) para que el total estimado coincida con lo que muestra el frontend
        base_total = importe_total_estimado_calc
        iva_rate = _parse_percentage_rate(data.get('iva'))
        iva_amount = (base_total * iva_rate).quantize(Decimal('0.01')) if iva_rate else Decimal('0')
        iibb_rate = _parse_iibb_rate(data.get('iibb'))
        iibb_amount = (base_total * iibb_rate).quantize(Decimal('0.01')) if iibb_rate else Decimal('0')
        importe_total_estimado_calc = (base_total + iva_amount + iibb_amount).quantize(Decimal('0.01'))

        # --- Crear Cabecera de la Orden ---
        # Generar un ID único si usas UUID como PK string
        # nuevo_id_orden = str(uuid.uuid4())
        # O dejar que el autoincremento de la DB genere el ID int

        # Generar número de solicitud interno (ejemplo simple)
        # Podrías tener una secuencia en la DB o una lógica más robusta
        num_ordenes_hoy = OrdenCompra.query.filter(db.func.date(OrdenCompra.fecha_creacion) == datetime.date.today()).count()
        nro_interno_solicitud = f"OC-{datetime.date.today().strftime('%Y%m%d')}-{num_ordenes_hoy+1:04d}"

        # Determinar si la orden debe ajustarse por TC (ajuste_tc=True => precios en USD)
        ajuste_tc_payload = None
        if 'ajuste_tc' in data:
            ajuste_tc_payload = str(data.get('ajuste_tc')).lower() == 'true' or data.get('ajuste_tc') is True
        elif 'moneda' in data:
            ajuste_tc_payload = str(data.get('moneda')).upper() in ['USD', 'US$']
        else:
            ajuste_tc_payload = False

        # Fecha tentativa: no creamos nueva columna para evitar migración; la guardamos en observaciones
        fecha_entrega_payload = data.get('fecha_entrega_tentativa')
        fecha_entrega_dt = None
        if fecha_entrega_payload:
            try:
                fecha_entrega_dt = datetime.datetime.fromisoformat(fecha_entrega_payload)
            except Exception:
                fecha_entrega_dt = None

        obs_init = data.get("observaciones_solicitud") or ''
        if fecha_entrega_dt:
            marker = "__FECHA_ENTREGA_TENTATIVA__:" + fecha_entrega_dt.isoformat()
            if '__FECHA_ENTREGA_TENTATIVA__' not in obs_init:
                obs_init = (obs_init + ('\n' if obs_init else '') + marker)

        # Si el usuario es Admin, la OC se crea directamente como 'APROBADO' y se registra el aprobador
        if rol_usuario and rol_usuario.upper() == "ADMIN":
            nueva_orden = OrdenCompra(
                nro_solicitud_interno=nro_interno_solicitud,
                proveedor_id=proveedor_id,
                forma_pago=data.get("forma_pago"),
                importe_total_estimado=importe_total_estimado_calc,
                observaciones_solicitud=obs_init,
                estado="APROBADO",
                solicitado_por_id=usuario_solicitante_id,
                aprobado_por_id=usuario_solicitante_id,
                fecha_aprobacion=datetime.datetime.now(),
                ajuste_tc=ajuste_tc_payload
            )
        else:
            nueva_orden = OrdenCompra(
                nro_solicitud_interno=nro_interno_solicitud,
                proveedor_id=proveedor_id,
                forma_pago=data.get("forma_pago"),
                importe_total_estimado=importe_total_estimado_calc,
                observaciones_solicitud=obs_init,
                estado="SOLICITADO",
                solicitado_por_id=usuario_solicitante_id,
                ajuste_tc=ajuste_tc_payload
            )

        # Asociar detalles a la orden
        nueva_orden.items = detalles_db # SQLAlchemy maneja la FK

        # Campos adicionales de cabecera si vienen en el payload
        nueva_orden.cuenta = data.get('cuenta', nueva_orden.cuenta)
        nueva_orden.iibb = data.get('iibb', nueva_orden.iibb)
        nueva_orden.tipo_caja = data.get('tipo_caja', nueva_orden.tipo_caja)
        # Registrar pago inicial si viene
        importe_abonado_payload = data.get('importe_abonado')
        if importe_abonado_payload is not None:
            try:
                abonado = Decimal(str(importe_abonado_payload))
                if abonado < 0:
                    return jsonify({"error": "'importe_abonado' no puede ser negativo"}), 400
                if abonado > importe_total_estimado_calc:
                    return jsonify({"error": "'importe_abonado' no puede superar el total estimado"}), 400
                nueva_orden.importe_abonado = abonado
            except (InvalidOperation, TypeError):
                return jsonify({"error": "'importe_abonado' inválido"}), 400

        if nueva_orden.forma_pago == 'Cheque':
            nueva_orden.cheque_perteneciente_a = data.get('cheque_perteneciente_a')
        else:
            nueva_orden.cheque_perteneciente_a = None

        try:
            from ..models import TipoCambio
            o = TipoCambio.query.filter_by(nombre='Oficial').first()
            snap = {
                'TC_Oficial': float(o.valor) if o and o.valor else None,
                'fecha': datetime.datetime.utcnow().isoformat()
            }
            s = "__TC_SNAPSHOT__:" + json.dumps(snap, ensure_ascii=False)
            obs = nueva_orden.observaciones_solicitud or ''
            if '__TC_SNAPSHOT__' not in obs:
                nueva_orden.observaciones_solicitud = (obs + ('\n' if obs else '') + s)
        except Exception:
            pass

        db.session.add(nueva_orden)
        db.session.commit()
        try:
            total_crear = nueva_orden.importe_total_estimado or Decimal('0')
            abonado_crear = nueva_orden.importe_abonado or Decimal('0')
            if rol_usuario and rol_usuario.upper() == "ADMIN" and total_crear > 0 and abonado_crear < total_crear:
                nueva_orden.estado = 'CON DEUDA'
                db.session.commit()
                debito_existente = db.session.query(MovimientoProveedor).filter(
                    MovimientoProveedor.orden_id == nueva_orden.id,
                    MovimientoProveedor.tipo == 'DEBITO'
                ).first()
                if not debito_existente:
                    monto_deuda = (total_crear - abonado_crear)
                    # Convertir deuda a ARS si la orden está en USD
                    monto_deuda_ars = _convert_to_ars(monto_deuda, nueva_orden.ajuste_tc)
                    mov_debito_crear = MovimientoProveedor(
                        proveedor_id=nueva_orden.proveedor_id,
                        orden_id=nueva_orden.id,
                        tipo='DEBITO',
                        monto=monto_deuda_ars,
                        descripcion=f"OC {nueva_orden.id} - Deuda al crear ({total_crear} {('USD' if nueva_orden.ajuste_tc else 'ARS')})",
                        usuario=usuario_nombre
                    )
                    db.session.add(mov_debito_crear)
                    db.session.commit()
                # Registrar crédito si se abonó al crear
                if abonado_crear > Decimal('0'):
                    mov_credito_crear = MovimientoProveedor(
                        proveedor_id=nueva_orden.proveedor_id,
                        orden_id=nueva_orden.id,
                        tipo='CREDITO',
                        monto=_convert_to_ars(abonado_crear, nueva_orden.ajuste_tc),
                        descripcion=f"OC {nueva_orden.id} - Pago al crear",
                        usuario=usuario_nombre
                    )
                    db.session.add(mov_credito_crear)
                    db.session.commit()
        except Exception:
            logger.warning("No se pudo registrar deuda al crear OC %s", nueva_orden.id)

        try:
            log = AuditLog(
                entidad='OrdenCompra',
                entidad_id=nueva_orden.id,
                accion='CREAR',
                usuario=usuario_nombre
            )
            log.set_nuevos({
                'orden': formatear_orden_por_rol(nueva_orden, rol="ADMIN")
            })
            db.session.add(log)
            db.session.commit()
        except Exception:
            db.session.rollback()

        logger.info("Orden de compra creada: ID %s, Nro Interno %s", nueva_orden.id, nro_interno_solicitud)
        # Devolver la orden completa (formateada por rol, ADMIN ve todo al crear)
        return jsonify({
            "status": "success",
            "message": "Orden de compra solicitada exitosamente.",
            "orden": formatear_orden_por_rol(nueva_orden, rol="ADMIN")
        }), 201

    except (ValueError, TypeError, InvalidOperation) as e:
        db.session.rollback()
        logger.exception("Datos inválidos al procesar items de orden: %s", e)
        return jsonify({"error": f"Error en los datos de los items: {e}"}), 400
    except Exception as e:
        db.session.rollback()
        logger.exception("Excepción inesperada al crear orden de compra")
        return jsonify({"error": "Error interno del servidor al crear la orden"}), 500


# --- Endpoint: Obtener Órdenes de Compra (Lista) ---
@compras_bp.route('/obtener_todas', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['ALMACEN'], ROLES['CONTABLE']) 
def obtener_ordenes_compra(current_user):
    """Obtiene lista de órdenes de compra, con filtros opcionales y paginación."""
    logger.info("Recibida solicitud GET en /ordenes_compra")
    rol_usuario = request.headers.get("X-User-Role", "almacen")  # Simular rol

    try:
        query = OrdenCompra.query

        # --- Aplicar Filtros ---
        estado_filtro = request.args.get('estado')
        if estado_filtro:
            if estado_filtro not in ESTADOS_ORDEN:  # Validar estado
                return jsonify({"error": f"Estado de filtro inválido: '{estado_filtro}'"}), 400
            query = query.filter(OrdenCompra.estado == estado_filtro)
            logger.debug("Filtrando por estado: %s", estado_filtro)

        proveedor_id_filtro = request.args.get('proveedor_id', type=int)
        if proveedor_id_filtro:
            query = query.filter(OrdenCompra.proveedor_id == proveedor_id_filtro)
            logger.debug("Filtrando por proveedor ID: %s", proveedor_id_filtro)

        # Ordenar (ej: por fecha creación descendente)
        query = query.order_by(OrdenCompra.fecha_creacion.desc())

        # --- Paginación ---
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        paginated_result = query.paginate(page=page, per_page=per_page, error_out=False)
        ordenes_db = paginated_result.items

        # Formatear resultado según rol
        ordenes_formateadas = [formatear_orden_por_rol(orden, rol_usuario) for orden in ordenes_db]

        logger.info("Devolviendo %s órdenes para rol %s", len(ordenes_formateadas), rol_usuario)

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
        logger.exception("Excepción inesperada al obtener órdenes de compra")
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
    logger.info("Recibida solicitud GET en /ordenes_compra/%s", orden_id)
    rol_usuario = request.headers.get("X-User-Role", "almacen") # Simular rol

    try:
        # Usar .options(db.joinedload('*')) o selectinload para Eager Loading si es necesario
        # orden_db = db.session.get(OrdenCompra, orden_id, options=[db.selectinload(OrdenCompra.items).selectinload(DetalleOrdenCompra.producto)])
        orden_db = db.session.get(OrdenCompra, orden_id) # .get es bueno para PK
        if not orden_db:
            return jsonify({"error": "Orden de compra no encontrada"}), 404

        orden_formateada = formatear_orden_por_rol(orden_db, rol_usuario)
        logger.info("Devolviendo orden %s para rol %s", orden_id, rol_usuario)
        return jsonify(orden_formateada)

    except Exception as e:
        logger.exception("Excepción inesperada al obtener orden de compra %s", orden_id)
        return jsonify({"error": "Error interno del servidor al obtener la orden"}), 500


# --- Endpoint: Aprobar Orden de Compra ---
@compras_bp.route('/aprobar/<int:orden_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN']) # Solo ADMIN puede aprobar 
def aprobar_orden_compra(current_user, orden_id):
    """Cambia el estado de una orden a 'Aprobado' (Rol     ADMIN)."""
    logger.info("Recibida solicitud PUT en /ordenes_compra/%s/aprobar", orden_id)
    rol_usuario = request.headers.get("X-User-Role", "almacen") # Simular rol
    usuario_aprobador = request.headers.get("X-User-Name", "Sistema") # Simular usuario aprobador

    # --- Validación de Rol (Simulada - Reemplazar con real) ---
    if rol_usuario != "ADMIN":
        return jsonify({"error": "Acción no permitida para este rol."}), 403 # Forbidden

    data = request.json
    if not data:
        return jsonify({"error": "Payload JSON vacío"}), 400

    try:
        orden_db = db.session.query(OrdenCompra).options(
            db.selectinload(OrdenCompra.items)
        ).get(orden_id)
        if not orden_db:
            return jsonify({"error": "Orden de compra no encontrada"}), 404

        # Validar estado actual
        if orden_db.estado != 'SOLICITADO':
            return jsonify({"error": f"Solo se pueden aprobar órdenes en estado 'SOLICITADO'. Estado actual: {orden_db.estado}"}), 409 # Conflict

        # --- Actualizar datos generales de la Orden de Compra ---
        orden_db.proveedor_id = data.get('proveedor_id', orden_db.proveedor_id)
        orden_db.cuenta = data.get('cuenta', orden_db.cuenta)
        orden_db.iibb = data.get('iibb', orden_db.iibb)
        orden_db.observaciones_solicitud = data.get('observaciones_solicitud', orden_db.observaciones_solicitud)
        if 'ajuste_tc' in data:
            ajuste_valor = data.get('ajuste_tc')
            orden_db.ajuste_tc = str(ajuste_valor).lower() == 'true' or ajuste_valor is True

        # --- Actualizar items (solo si vienen en el payload) ANTES de validar pago---
        items_payload = data.get('items', [])
        if items_payload and orden_db.items:
            for item_data in items_payload:
                id_linea = item_data.get('id_linea')
                detalle = next((item for item in orden_db.items if item.id == id_linea), None)
                if detalle:
                    if 'cantidad_solicitada' in item_data:
                        detalle.cantidad_solicitada = item_data['cantidad_solicitada']
                    if 'precio_unitario_estimado' in item_data:
                        detalle.precio_unitario_estimado = item_data['precio_unitario_estimado']
                    # Recalcular importe línea si ambos presentes
                    if 'cantidad_solicitada' in item_data and 'precio_unitario_estimado' in item_data:
                        detalle.importe_linea_estimado = item_data['cantidad_solicitada'] * item_data['precio_unitario_estimado']

        # Actualizar el importe total de la orden con el del payload o recalcular
        if 'importe_total_estimado' in data:
            orden_db.importe_total_estimado = data['importe_total_estimado']
        else:
            # Recalcular si no viene
            total = sum([item.importe_linea_estimado or 0 for item in orden_db.items])
            orden_db.importe_total_estimado = total

        # Calcular total INCLUYENDO IVA e IIBB antes de validar importe_abonado
        base_total = orden_db.importe_total_estimado or Decimal('0')
        
        # Usar nuevas tasas si vienen en el payload, sino usar las existentes
        iva_rate_for_calc = _parse_percentage_rate(data.get('iva') if 'iva' in data else orden_db.iva or '0')
        iibb_rate_for_calc = _parse_iibb_rate(data.get('iibb') if 'iibb' in data else orden_db.iibb or '0')
        
        iva_amount = (base_total * iva_rate_for_calc).quantize(Decimal('0.01')) if iva_rate_for_calc else Decimal('0')
        iibb_amount = (base_total * iibb_rate_for_calc).quantize(Decimal('0.01')) if iibb_rate_for_calc else Decimal('0')
        total_estimado_con_impuestos = (base_total + iva_amount + iibb_amount).quantize(Decimal('0.01'))

        # --- Actualizar datos de pago (si vienen) ---
        if 'importe_abonado' in data:
            try:
                importe_abonado_val = Decimal(str(data.get('importe_abonado')))
                if importe_abonado_val < 0:
                    return jsonify({"error": "'importe_abonado' no puede ser negativo"}), 400
                if total_estimado_con_impuestos and importe_abonado_val > total_estimado_con_impuestos:
                    return jsonify({"error": "'importe_abonado' no puede superar el total estimado"}), 400
                orden_db.importe_abonado = importe_abonado_val
            except (InvalidOperation, TypeError):
                logger.warning("importe_abonado inválido en aprobación, se mantiene valor previo")
        orden_db.forma_pago = data.get('forma_pago', orden_db.forma_pago)
        if orden_db.forma_pago == 'Cheque':
            orden_db.cheque_perteneciente_a = data.get('cheque_perteneciente_a', orden_db.cheque_perteneciente_a)
        else:
            orden_db.cheque_perteneciente_a = None

        try:
            from ..models import TipoCambio
            o = TipoCambio.query.filter_by(nombre='Oficial').first()
            snap = {
                'TC_Oficial': float(o.valor) if o and o.valor else None,
                'fecha': datetime.datetime.utcnow().isoformat()
            }
            s = "__TC_SNAPSHOT__:" + json.dumps(snap, ensure_ascii=False)
            obs = orden_db.observaciones_solicitud or ''
            if '__TC_SNAPSHOT__' not in obs:
                orden_db.observaciones_solicitud = (obs + ('\n' if obs else '') + s)
        except Exception:
            pass

        # Si el payload incluye cambios en IVA o IIBB, recalcular importe y actualizar deuda
        try:
            iva_flag = data.get('iva') if 'iva' in data else None
            iva_rate = data.get('iva_rate') if 'iva_rate' in data else None
            iibb_payload = data.get('iibb') if 'iibb' in data else None
            _recalcular_importe_y_actualizar_deuda(orden_db,
                                                   usuario_actualiza=usuario_aprobador,
                                                   iva_flag=iva_flag,
                                                   iva_rate=iva_rate,
                                                   iibb_payload=iibb_payload)
        except Exception:
            logger.warning("No se pudo recalcular importe/deuda al aprobar OC %s", orden_id)

        # --- Actualizar estado y aprobador ---
        total_aprob = orden_db.importe_total_estimado or Decimal('0')
        abonado_aprob = orden_db.importe_abonado or Decimal('0')
        # Estados multidimensionales: recepción pendiente y deuda (usar UPPERCASE)
        orden_db.estado_recepcion = 'EN_ESPERA_RECEPCION'
        orden_db.estado = 'CON DEUDA' if total_aprob > abonado_aprob else 'APROBADO'
        orden_db.fecha_aprobacion = datetime.datetime.utcnow()
        orden_db.aprobado_por = usuario_aprobador
        # fecha_actualizacion se actualiza via onupdate

        prev = formatear_orden_por_rol(orden_db, rol_usuario)
        db.session.commit()
        try:
            # Registrar crédito si se abonó en la aprobación (convertir a ARS si OC está en USD)
            if abonado_aprob and abonado_aprob > Decimal('0'):
                mov_credito_aprob = MovimientoProveedor(
                    proveedor_id=orden_db.proveedor_id,
                    orden_id=orden_db.id,
                    tipo='CREDITO',
                    monto=_convert_to_ars(abonado_aprob, orden_db.ajuste_tc),
                    descripcion=f"OC {orden_db.id} - Pago al aprobar",
                    usuario=usuario_aprobador
                )
                db.session.add(mov_credito_aprob)
                db.session.commit()
            
            # Registrar deuda si hay saldo pendiente
            if total_aprob > abonado_aprob:
                debito_existente = db.session.query(MovimientoProveedor).filter(
                    MovimientoProveedor.orden_id == orden_id,
                    MovimientoProveedor.tipo == 'DEBITO'
                ).first()
                if not debito_existente:
                    monto_deuda = (total_aprob - abonado_aprob)
                    monto_deuda_ars = _convert_to_ars(monto_deuda, orden_db.ajuste_tc)
                    mov_debito_aprob = MovimientoProveedor(
                        proveedor_id=orden_db.proveedor_id,
                        orden_id=orden_id,
                        tipo='DEBITO',
                        monto=monto_deuda_ars,
                        descripcion=f"OC {orden_id} - Deuda al aprobar ({orden_db.importe_total_estimado} {('USD' if orden_db.ajuste_tc else 'ARS')})",
                        usuario=usuario_aprobador
                    )
                    db.session.add(mov_debito_aprob)
                    db.session.commit()
        except Exception:
            logger.warning("No se pudo registrar movimiento de proveedor (aprobación) para OC %s", orden_id)
        try:
            log = AuditLog(
                entidad='OrdenCompra',
                entidad_id=orden_id,
                accion='APROBAR',
                usuario=usuario_aprobador
            )
            log.set_previos(prev)
            log.set_nuevos(formatear_orden_por_rol(orden_db, rol_usuario))
            db.session.add(log)
            db.session.commit()
        except Exception:
            db.session.rollback()
        logger.info("Orden %s aprobada por %s", orden_id, usuario_aprobador)

        return jsonify({
            "status": "success",
            "message": "Orden de compra aprobada.",
            "orden": formatear_orden_por_rol(orden_db, rol_usuario) # Devolver estado actualizado
        })

    except Exception as e:
        db.session.rollback()
        logger.exception("Excepción inesperada al aprobar orden %s", orden_id)
        return jsonify({"error": "Error interno del servidor al aprobar la orden"}), 500


# --- Endpoint: Rechazar Orden de Compra ---
@compras_bp.route('/rechazar/<int:orden_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN']) # Solo ADMIN puede rechazar 
def rechazar_orden_compra(current_user, orden_id):
    """Cambia el estado de una orden a 'Rechazado' (Rol     ADMIN)."""
    logger.info("Recibida solicitud PUT en /ordenes_compra/%s/rechazar", orden_id)
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

        if orden_db.estado != 'SOLICITADO':
            return jsonify({"error": f"Solo se pueden rechazar órdenes en estado 'SOLICITADO'. Estado actual: {orden_db.estado}"}), 409 # Conflict

        # --- Actualizar Orden ---
        orden_db.estado = 'RECHAZADO'
        orden_db.fecha_rechazo = datetime.datetime.utcnow()
        orden_db.rechazado_por = usuario_rechazador
        orden_db.motivo_rechazo = data['motivo_rechazo']

        db.session.commit()
        logger.info("Orden %s rechazada por %s. Motivo: %s", orden_id, usuario_rechazador, data['motivo_rechazo'])

        return jsonify({
            "status": "success",
            "message": "Orden de compra rechazada.",
            "orden": formatear_orden_por_rol(orden_db, rol_usuario)
        })

    except Exception as e:
        db.session.rollback()
        logger.exception("Excepción inesperada al rechazar orden %s", orden_id)
        return jsonify({"error": "Error interno del servidor al rechazar la orden"}), 500


# --- Endpoint: Recibir Mercadería de Orden de Compra ---
@compras_bp.route('/recibir/<int:orden_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['ALMACEN'])
def recibir_orden_compra(current_user, orden_id):
    logger.info("Recibida solicitud PUT en /ordenes_compra/%s/recibir", orden_id)
    rol_usuario = request.headers.get("X-User-Role", "almacen")
    usuario_receptor = request.headers.get("X-User-Name", "Sistema")
    data = request.json

    if not data:
        return jsonify({"error": "Payload JSON vacío"}), 400

    try:
        orden_db = db.session.query(OrdenCompra).options(
            db.selectinload(OrdenCompra.items)
        ).get(orden_id)

        if not orden_db:
            return jsonify({"error": "Orden de compra no encontrada"}), 404
            
        
        # 1. Actualizar datos generales de la Orden de Compra
        orden_db.proveedor_id = data.get('proveedor_id', orden_db.proveedor_id)
        orden_db.cuenta = data.get('cuenta', orden_db.cuenta)
        orden_db.iibb = data.get('iibb', orden_db.iibb)

        if 'ajuste_tc' in data:
            ajuste_valor = data.get('ajuste_tc')
            orden_db.ajuste_tc = str(ajuste_valor).lower() == 'true' or ajuste_valor is True
        
        # 2. Actualizar datos de los items y calcular total (soportando múltiples líneas)
        total_estimado_recalculado = Decimal('0.0')
        # Si payload trae items para actualizar cantidades/precios, aplicarlos por id_linea
        items_payload_update = data.get('items', [])
        if items_payload_update and orden_db.items:
            for item_update in items_payload_update:
                id_linea = item_update.get('id_linea')
                detalle = next((it for it in orden_db.items if it.id == id_linea), None)
                if detalle:
                    if 'cantidad_solicitada' in item_update:
                        detalle.cantidad_solicitada = Decimal(str(item_update.get('cantidad_solicitada', detalle.cantidad_solicitada or 0)))
                    if 'precio_unitario_estimado' in item_update:
                        detalle.precio_unitario_estimado = Decimal(str(item_update.get('precio_unitario_estimado', detalle.precio_unitario_estimado or 0)))
                    # Recalcular importe línea
                    detalle.importe_linea_estimado = (detalle.cantidad_solicitada or Decimal('0')) * (detalle.precio_unitario_estimado or Decimal('0'))

        # Si no vienen items para actualización, permitir payload simple para una sola línea (compatibilidad)
        if not items_payload_update and orden_db.items:
            # intentar leer campos simples 'cantidad' y 'precio_unitario' para compatibilidad
            try:
                cantidad_solicitada = Decimal(str(data.get('cantidad', '0')))
                precio_unitario = Decimal(str(data.get('precio_unitario', '0')))
                if orden_db.items:
                    detalle0 = orden_db.items[0]
                    detalle0.cantidad_solicitada = cantidad_solicitada
                    detalle0.precio_unitario_estimado = precio_unitario
                    detalle0.importe_linea_estimado = cantidad_solicitada * precio_unitario
            except Exception:
                pass

        # Recalcular total estimado
        total_estimado_recalculado = sum([(item.importe_linea_estimado or Decimal('0')) for item in orden_db.items])

        # Actualizar el importe total de la orden con el del payload o el recalculado
        orden_db.importe_total_estimado = Decimal(str(data.get('importe_total', total_estimado_recalculado)))

        # Si el payload incluye cambios en IVA o IIBB, recalcular importe y actualizar deuda
        try:
            iva_flag = data.get('iva') if 'iva' in data else None
            iva_rate = data.get('iva_rate') if 'iva_rate' in data else None
            iibb_payload = data.get('iibb') if 'iibb' in data else None
            _recalcular_importe_y_actualizar_deuda(orden_db,
                                                   usuario_actualiza=usuario_receptor,
                                                   iva_flag=iva_flag,
                                                   iva_rate=iva_rate,
                                                   iibb_payload=iibb_payload)
        except Exception:
            logger.warning("No se pudo recalcular importe/deuda al recibir OC %s", orden_id)

        # 3. Procesar la recepción de items
        items_recibidos = data.get('items_recibidos', [])
        if items_recibidos:
            for item_data in items_recibidos:
                id_linea = item_data.get('id_linea')
                detalle_para_recepcion = next((item for item in orden_db.items if item.id == id_linea), None)
                if detalle_para_recepcion:
                    cantidad_recibida_ahora = Decimal(str(item_data.get('cantidad_recibida', '0')))
                    # Solo permitir recepción si está aprobada o ya parcialmente recibida o con deuda
                    if orden_db.estado not in ['APROBADO', 'RECIBIDA_PARCIAL', 'CON DEUDA', 'EN_ESPERA_RECEPCION'] and cantidad_recibida_ahora > 0:
                        return jsonify({"error": f"No se puede recibir mercadería para una orden con estado: {orden_db.estado}"}), 409
                    cantidad_previa = detalle_para_recepcion.cantidad_recibida or Decimal('0')
                    detalle_para_recepcion.cantidad_recibida = cantidad_previa + cantidad_recibida_ahora

        # Determinar si la recepción es parcial o completa
        all_received = True
        any_received = False
        for it in orden_db.items:
            qty_req = it.cantidad_solicitada or Decimal('0')
            qty_rec = it.cantidad_recibida or Decimal('0')
            if qty_rec < qty_req:
                all_received = False
            if qty_rec > 0:
                any_received = True

        # 4. Actualizar cabecera de la recepción
        orden_db.fecha_recepcion = datetime.datetime.utcnow()
        orden_db.recibido_por = usuario_receptor
        orden_db.nro_remito_proveedor = data.get('nro_remito_proveedor')
        # Establecer estado de recepción acorde a lo recibido
        orden_db.estado_recepcion = 'COMPLETA' if all_received else ('PARCIAL' if any_received else (data.get('estado_recepcion') or orden_db.estado_recepcion))

        # 5. Procesar el pago y determinar el estado final
        nuevo_abono = Decimal(str(data.get('importe_abonado', '0')))
        importe_abonado_previo = orden_db.importe_abonado or Decimal('0')
        orden_db.importe_abonado = importe_abonado_previo + nuevo_abono

        # Estado final de la orden según recepción y pagos
        if all_received and orden_db.importe_abonado >= orden_db.importe_total_estimado:
            orden_db.estado = 'RECIBIDO'
        elif all_received and orden_db.importe_abonado < orden_db.importe_total_estimado:
            orden_db.estado = 'RECIBIDA_PARCIAL'
        else:
            # Si no fue recibida completamente, mantén en deuda o en estado correspondiente
            orden_db.estado = 'CON DEUDA' if orden_db.importe_abonado < orden_db.importe_total_estimado else orden_db.estado
        
        # 6. Actualizar datos de pago
        orden_db.forma_pago = data.get('forma_pago', orden_db.forma_pago)
        if orden_db.forma_pago == 'Cheque':
            orden_db.cheque_perteneciente_a = data.get('cheque_perteneciente_a')
        else:
            orden_db.cheque_perteneciente_a = None # Limpiar si no es cheque
        orden_db.tipo_caja = data.get('tipo_caja', orden_db.tipo_caja)
        try:
            from ..models import TipoCambio
            o = TipoCambio.query.filter_by(nombre='Oficial').first()
            snap = {
                'TC_Oficial': float(o.valor) if o and o.valor else None,
                'fecha': datetime.datetime.utcnow().isoformat()
            }
            s = "__TC_SNAPSHOT__:" + json.dumps(snap, ensure_ascii=False)
            notas = orden_db.notas_recepcion or ''
            if '__TC_SNAPSHOT__' not in notas:
                orden_db.notas_recepcion = (notas + ('\n' if notas else '') + s)
        except Exception:
            pass
        prev = formatear_orden_por_rol(orden_db, rol_usuario)
        # 7. Registrar movimientos de proveedor (DEBITO una vez por OC, CREDITO por pagos)
        try:
            debito_existente = db.session.query(MovimientoProveedor).filter(
                MovimientoProveedor.orden_id == orden_db.id,
                MovimientoProveedor.tipo == 'DEBITO'
            ).first()
            if not debito_existente:
                restante = (orden_db.importe_total_estimado or Decimal('0')) - (orden_db.importe_abonado or Decimal('0'))
                restante = restante if restante > Decimal('0') else Decimal('0')
                monto_deuda_ars = _convert_to_ars(restante, orden_db.ajuste_tc)
                mov_debito = MovimientoProveedor(
                    proveedor_id=orden_db.proveedor_id,
                    orden_id=orden_db.id,
                    tipo='DEBITO',
                    monto=monto_deuda_ars,
                    descripcion=f"OC {orden_db.id} - Deuda por recepción ({orden_db.importe_total_estimado} {('USD' if orden_db.ajuste_tc else 'ARS')})",
                    usuario=usuario_receptor
                )
                db.session.add(mov_debito)
            
            # Registrar crédito si se abonó ahora (convertir a ARS si OC estaba en USD)
            if nuevo_abono > Decimal('0'):
                monto_credito_ars = _convert_to_ars(nuevo_abono, orden_db.ajuste_tc)
                mov_credito = MovimientoProveedor(
                    proveedor_id=orden_db.proveedor_id,
                    orden_id=orden_db.id,
                    tipo='CREDITO',
                    monto=monto_credito_ars,
                    descripcion=f"OC {orden_db.id} - Pago en recepción",
                    usuario=usuario_receptor
                )
                db.session.add(mov_credito)
        except Exception:
            logger.warning("No se pudo registrar movimiento de proveedor para OC %s", orden_db.id)

        db.session.commit()
        try:
            log = AuditLog(
                entidad='OrdenCompra',
                entidad_id=orden_id,
                accion='RECIBIR',
                usuario=usuario_receptor
            )
            log.set_previos(prev)
            log.set_nuevos(formatear_orden_por_rol(orden_db, rol_usuario))
            db.session.add(log)
            db.session.commit()
        except Exception:
            db.session.rollback()
        
        return jsonify({
            "status": "success",
            "message": "Mercadería registrada y orden actualizada correctamente.",
            "orden": formatear_orden_por_rol(orden_db, rol_usuario)
        })

    except (InvalidOperation, TypeError) as e:
        db.session.rollback()
        logger.exception("Error de conversión de datos en la orden %s: %s", orden_id, e)
        return jsonify({"error": f"Dato numérico inválido: {e}"}), 400
    except Exception as e:
        db.session.rollback()
        logger.exception("Excepción inesperada al recibir orden %s: %s", orden_id, e)
        return jsonify({"error": "Error interno del servidor al procesar la recepción"}), 500
