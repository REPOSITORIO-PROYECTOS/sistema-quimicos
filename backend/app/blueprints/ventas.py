# app/blueprints/ventas.py

from flask import Blueprint, request, jsonify, render_template, make_response
from sqlalchemy.orm import selectinload # Para Eager Loading
from .. import db
from ..models import Venta, DetalleVenta, Producto, UsuarioInterno, TipoCambio
# Ajusta la ruta si moviste las funciones a otro lugar (ej: app/utils.py)
from .productos import calcular_costo_producto_referencia, obtener_coeficiente_por_rango

# --- ¡IMPORT CORREGIDO! ---
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

import traceback
import datetime

# Crear el Blueprint para ventas
ventas_bp = Blueprint('ventas', __name__, url_prefix='/ventas')

# --- Constantes de Recargo ---
RECARGO_TRANSFERENCIA_PORC = Decimal("10.5") # 10.5%
RECARGO_FACTURA_PORC = Decimal("21.0") # 21.0% (IVA)


# --- Función Auxiliar para calcular precio item VENTA ---
def calcular_precio_item_venta(producto_id, cantidad_decimal):
    """
    Calcula el precio unitario y total para un item de venta.
    Reutiliza la lógica de obtener costo y coeficiente.
    Devuelve: (precio_unitario_ars, precio_total_ars, costo_momento_ars, coeficiente, error_msg)
    """
    try:
        # Usar .get() para buscar por PK es eficiente
        producto = db.session.get(Producto, producto_id)
        if not producto:
            return None, None, None, None, f"Producto ID {producto_id} no encontrado."

        # 1. Calcular Costo Base en USD de Referencia
        costo_ref_usd = calcular_costo_producto_referencia(producto_id)

        # 2. Obtener Tipo de Cambio correspondiente (Oficial/Empresa)
        nombre_tc_aplicar = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
        tipo_cambio = TipoCambio.query.filter_by(nombre=nombre_tc_aplicar).first()
        if not tipo_cambio or tipo_cambio.valor is None or tipo_cambio.valor <= 0:
            raise ValueError(f"Tipo de cambio '{nombre_tc_aplicar}' no válido o no encontrado.")

        # 3. Convertir Costo a ARS para Venta (Este es el costo_unitario_momento_ars)
        costo_momento_ars = (costo_ref_usd * tipo_cambio.valor).quantize(Decimal("0.0001")) # 4 dec precisión interna

        # 4. Obtener datos para fórmula de venta (margen, coeficiente)
        margen = Decimal(producto.margen) if producto.margen is not None else Decimal(0)
        # margen_float = float(margen) # Usaremos Decimal para cálculo
        tipo_calculo = producto.tipo_calculo
        ref_calculo_str = str(producto.ref_calculo) if producto.ref_calculo is not None else None

        # Validar datos necesarios
        if margen < 0 or margen >= 1: raise ValueError(f"Margen inválido ({margen}) para producto ID {producto_id}.")
        if not tipo_calculo or ref_calculo_str is None:
            raise ValueError(f"Faltan tipo_calculo o ref_calculo en producto ID {producto_id}.")

        # 5. Obtener Coeficiente de calculator.core (convertir cantidad a string)
        cantidad_str = str(cantidad_decimal)
        coeficiente = obtener_coeficiente_por_rango(ref_calculo_str, cantidad_str, tipo_calculo)
        if coeficiente is None:
            raise ValueError(f"No se encontró coeficiente para Qty:{cantidad_str}, Ref:{ref_calculo_str}, Tipo:{tipo_calculo}.")

        # Convertir coeficiente a Decimal para cálculo preciso
        try:
             coeficiente_decimal = Decimal(str(coeficiente))
        except InvalidOperation:
             raise ValueError(f"Coeficiente obtenido ('{coeficiente}') no es un número válido.")

        # 6. Calcular Precio de Venta usando Decimal
        denominador = Decimal(1) - margen
        if denominador == 0: raise ValueError("Margen no puede ser 1 (división por cero).")

        precio_unitario_ars = (costo_momento_ars / denominador * coeficiente_decimal).quantize(Decimal("0.0001")) # Precisión unitaria
        precio_total_ars = (precio_unitario_ars * cantidad_decimal).quantize(Decimal("0.01"), ROUND_HALF_UP) # Redondeo normal para total ARS

        return precio_unitario_ars, precio_total_ars, costo_momento_ars, coeficiente_decimal, None

    except ValueError as e:
        # Errores esperados (producto no encontrado, TC inválido, etc.)
        print(f"WARN [calcular_precio_item_venta]: Error calculando precio para producto {producto_id}: {e}")
        return None, None, None, None, str(e)
    except Exception as e:
        # Errores inesperados
        print(f"ERROR [calcular_precio_item_venta]: Excepción inesperada para producto {producto_id}")
        traceback.print_exc()
        return None, None, None, None, "Error interno al calcular precio del item."


# --- Función Auxiliar para calcular recargos y total final ---
def calcular_monto_final_y_vuelto(monto_base, forma_pago=None, requiere_factura=False, monto_pagado=None):
    """
    Calcula los recargos, el monto final y el vuelto.
    Retorna: (monto_final, recargo_transf, recargo_fact, vuelto, error_msg)
    """
    try:
        if not isinstance(monto_base, Decimal):
            monto_base = Decimal(str(monto_base))
    except (InvalidOperation, TypeError):
        return None, None, None, None, "Monto base inválido."


    monto_actual = monto_base
    recargo_t = Decimal(0)
    recargo_f = Decimal(0)
    vuelto = None
    error = None

    # 1. Aplicar recargo por transferencia
    # Usar lower() y strip() para flexibilidad en forma_pago
    if forma_pago and isinstance(forma_pago, str) and forma_pago.strip().lower() == 'transferencia':
        recargo_calculado = (monto_actual * RECARGO_TRANSFERENCIA_PORC / Decimal(100)).quantize(Decimal("0.01"), ROUND_HALF_UP)
        recargo_t = recargo_calculado
        monto_actual += recargo_t
        print(f"DEBUG: Recargo Transferencia aplicado: {recargo_t}")

    # 2. Aplicar recargo por factura/IVA
    if requiere_factura: # Asume que viene como booleano
        recargo_calculado = (monto_actual * RECARGO_FACTURA_PORC / Decimal(100)).quantize(Decimal("0.01"), ROUND_HALF_UP)
        recargo_f = recargo_calculado
        monto_actual += recargo_f
        print(f"DEBUG: Recargo Factura aplicado: {recargo_f}")

    monto_final = monto_actual.quantize(Decimal("0.01"), ROUND_HALF_UP)

    # 3. Calcular vuelto
    if monto_pagado is not None:
        try:
            monto_pagado_decimal = Decimal(str(monto_pagado))
            if monto_pagado_decimal < monto_final:
                faltante = (monto_final - monto_pagado_decimal).quantize(Decimal("0.01"), ROUND_HALF_UP)
                error = f"El monto pagado ({monto_pagado_decimal:.2f}) es menor que el total final ({monto_final:.2f}). Faltan: {faltante:.2f}"
                print(f"WARN: {error}")
                # Devolver valores calculados hasta ahora, pero indicar el error
                return monto_final, recargo_t, recargo_f, None, error
            else:
                vuelto = (monto_pagado_decimal - monto_final).quantize(Decimal("0.01"), ROUND_HALF_UP)
                print(f"DEBUG: Vuelto calculado: {vuelto}")
        except (InvalidOperation, TypeError):
             error = f"Monto pagado ('{monto_pagado}') inválido."
             print(f"WARN: {error}")
             # Si el monto pagado es inválido, no podemos calcular vuelto, pero el resto está ok
             return monto_final, recargo_t, recargo_f, None, error

    return monto_final, recargo_t, recargo_f, vuelto, error


# --- Endpoint: Registrar Nueva Venta ---
@ventas_bp.route('/registrar', methods=['POST'])
def registrar_venta():
    """
    Registra una nueva venta, calcula recargos y vuelto opcionalmente.
    """
    data = request.get_json()
    if not data: return jsonify({"error": "Payload JSON vacío"}), 400

    # --- Validación básica de cabecera ---
    usuario_interno_id = data.get('usuario_interno_id')
    items_payload = data.get('items')
    if not usuario_interno_id or not isinstance(usuario_interno_id, int):
        return jsonify({"error": "Falta o es inválido 'usuario_interno_id'"}), 400
    if not items_payload or not isinstance(items_payload, list) or not items_payload:
        return jsonify({"error": "Falta o está vacía la lista 'items'"}), 400
    usuario = db.session.get(UsuarioInterno, usuario_interno_id)
    if not usuario: return jsonify({"error": f"Usuario interno ID {usuario_interno_id} no encontrado"}), 404

    # --- Opcionales para recargo/vuelto ---
    forma_pago = data.get('forma_pago') # String: "Efectivo", "Transferencia", etc.
    requiere_factura = data.get('requiere_factura', False) # Boolean
    monto_pagado_str = data.get('monto_pagado_cliente') # String o None

    detalles_venta_db = []
    monto_total_base_calc = Decimal("0.00")

    try:
        # --- 1. Procesar Items y Calcular Monto Base ---
        for idx, item_data in enumerate(items_payload):
            producto_id = item_data.get("producto_id")
            cantidad_str = str(item_data.get("cantidad", "")).strip().replace(',', '.')

            if not producto_id or not isinstance(producto_id, int):
                 return jsonify({"error": f"Item #{idx+1}: falta/inválido 'producto_id'"}), 400
            try:
                cantidad = Decimal(cantidad_str)
                if cantidad <= 0: raise ValueError("Cantidad debe ser positiva")
            except (InvalidOperation, ValueError):
                 return jsonify({"error": f"Item #{idx+1}: cantidad inválida ('{item_data.get('cantidad')}')"}), 400

            # Calcular precio para este item
            precio_u, precio_t, costo_u, coef, error_msg = calcular_precio_item_venta(producto_id, cantidad)
            if error_msg:
                 return jsonify({"error": f"Error al calcular precio para item #{idx+1} (Producto ID: {producto_id}): {error_msg}"}), 400 # Usar 400 o 422

            # Obtener el producto para guardar el margen (ya sabemos que existe)
            producto_db = db.session.get(Producto, producto_id)

            # Crear objeto DetalleVenta
            detalle = DetalleVenta(
                producto_id=producto_id,
                cantidad=cantidad,
                margen_aplicado=producto_db.margen, # Guardar margen usado
                costo_unitario_momento_ars=costo_u, # Costo ARS en ese momento
                coeficiente_usado=coef,
                precio_unitario_venta_ars=precio_u,
                precio_total_item_ars=precio_t
            )
            detalles_venta_db.append(detalle)
            monto_total_base_calc += precio_t # Sumar al total BASE

        monto_total_base_calc = monto_total_base_calc.quantize(Decimal("0.01"), ROUND_HALF_UP)
        print(f"DEBUG [registrar_venta]: Monto total base calculado: {monto_total_base_calc}")

        # --- 2. Calcular Recargos, Monto Final y Vuelto ---
        monto_final_calc, recargo_t_calc, recargo_f_calc, vuelto_calc, error_calculo_final = calcular_monto_final_y_vuelto(
            monto_total_base_calc,
            forma_pago,
            requiere_factura,
            monto_pagado_str # Pasar como string o None
        )

        # Si hubo error en cálculo final (ej: monto pagado insuficiente o inválido), devolverlo
        if error_calculo_final:
             # AÚN NO hacemos commit. Devolvemos el error.
             return jsonify({"error": error_calculo_final,
                             "monto_total_base": float(monto_total_base_calc),
                             "monto_final_requerido": float(monto_final_calc)}), 400 # Bad request

        print(f"DEBUG [registrar_venta]: Monto final: {monto_final_calc}, Rec T: {recargo_t_calc}, Rec F: {recargo_f_calc}, Vuelto: {vuelto_calc}")

        # --- 3. Crear y Guardar Venta en DB ---
        fecha_pedido_dt = None
        if data.get('fecha_pedido'):
            try:
                # Intentar parsear la fecha ISO (o el formato que esperes)
                fecha_pedido_dt = datetime.datetime.fromisoformat(data['fecha_pedido'])
            except ValueError:
                 print(f"WARN [registrar_venta]: Formato de fecha_pedido inválido: {data['fecha_pedido']}")
                 # Decidir si fallar o continuar sin fecha_pedido
                 # return jsonify({"error": "Formato de fecha_pedido inválido (usar ISO 8601)"}), 400

        nueva_venta = Venta(
            usuario_interno_id=usuario_interno_id,
            cliente_id=data.get('cliente_id'),
            fecha_pedido=fecha_pedido_dt,
            direccion_entrega=data.get('direccion_entrega'),
            cuit_cliente=data.get('cuit_cliente'),
            observaciones=data.get('observaciones'),
            monto_total=monto_total_base_calc, # Guardar monto base
            # Guardar datos de recargos y vuelto
            forma_pago=forma_pago,
            requiere_factura=requiere_factura,
            recargo_transferencia=recargo_t_calc if recargo_t_calc > 0 else None,
            recargo_factura=recargo_f_calc if recargo_f_calc > 0 else None,
            monto_final_con_recargos=monto_final_calc,
            monto_pagado_cliente=Decimal(monto_pagado_str) if monto_pagado_str is not None else None,
            vuelto_calculado=vuelto_calc
        )
        # Asociar detalles antes de añadir la venta a la sesión es buena práctica
        nueva_venta.detalles = detalles_venta_db

        db.session.add(nueva_venta)
        db.session.commit()

        print(f"INFO: Venta registrada: ID {nueva_venta.id}, Monto Final: {monto_final_calc}, Vuelto: {vuelto_calc}")

        # --- 4. Preparar Respuesta ---
        respuesta = {
            "status": "success",
            "message": "Venta registrada exitosamente.",
            "venta_id": nueva_venta.id,
            "monto_total_base": float(monto_total_base_calc),
            "recargos": {
                "transferencia": float(recargo_t_calc),
                "factura_iva": float(recargo_f_calc)
            },
            "monto_final_con_recargos": float(monto_final_calc),
            "monto_pagado_cliente": float(monto_pagado_str) if monto_pagado_str is not None else None,
            "vuelto_calculado": float(vuelto_calc) if vuelto_calc is not None else None
            # Podrías devolver la venta completa aquí si el frontend la necesita inmediatamente
            # "venta_completa": venta_a_dict_completo(nueva_venta)
        }
        return jsonify(respuesta), 201

    except (InvalidOperation, ValueError) as e: # Captura errores de conversión Decimal o validación
         db.session.rollback()
         print(f"ERROR [registrar_venta]: Datos inválidos - {e}")
         # Devolver el error específico si es posible
         return jsonify({"error": f"Datos inválidos: {e}"}), 400
    except Exception as e:
        db.session.rollback()
        print(f"ERROR [registrar_venta]: Excepción inesperada al registrar venta")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al registrar la venta"}), 500


# --- Endpoint: Calcular Solo Total con Recargos ---
@ventas_bp.route('/calcular_total', methods=['POST'])
def calcular_total_venta():
    """
    Calcula el monto final con recargos sin registrar la venta.
    """
    data = request.get_json()
    if not data or 'monto_base' not in data:
        return jsonify({"error": "Falta 'monto_base' en el payload"}), 400

    try:
        monto_base_str = str(data['monto_base'])
        forma_pago = data.get('forma_pago')
        requiere_factura = data.get('requiere_factura', False)

        monto_final, recargo_t, recargo_f, _, error_msg = calcular_monto_final_y_vuelto(
            monto_base_str, forma_pago, requiere_factura, None # No calcular vuelto
        )

        if error_msg: # Principalmente si monto_base es inválido
             return jsonify({"error": error_msg}), 400

        respuesta = {
            "monto_base": float(Decimal(monto_base_str)), # Reconvertir a float para JSON
            "forma_pago_aplicada": forma_pago,
            "requiere_factura_aplicada": requiere_factura,
            "recargos": {
                "transferencia": float(recargo_t),
                "factura_iva": float(recargo_f)
            },
            "monto_final_con_recargos": float(monto_final)
        }
        return jsonify(respuesta)

    except (InvalidOperation, TypeError, ValueError):
         return jsonify({"error": "Monto base inválido"}), 400
    except Exception as e:
        print(f"ERROR [calcular_total_venta]: Excepción inesperada")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor"}), 500

# --- Endpoint: Calcular Solo Vuelto ---
@ventas_bp.route('/calcular_vuelto', methods=['POST'])
def calcular_vuelto():
    """
    Calcula el vuelto dados un total final y un monto pagado.
    """
    data = request.get_json()
    if not data or 'monto_total_final' not in data or 'monto_pagado' not in data:
        return jsonify({"error": "Faltan 'monto_total_final' o 'monto_pagado'"}), 400

    try:
        monto_total = Decimal(str(data['monto_total_final']))
        monto_pagado = Decimal(str(data['monto_pagado']))

        if monto_pagado < monto_total:
             faltante = (monto_total - monto_pagado).quantize(Decimal("0.01"))
             return jsonify({"error": "El monto pagado es menor que el total final",
                             "vuelto": None, "faltante": float(faltante) }), 400 # Bad Request

        vuelto = (monto_pagado - monto_total).quantize(Decimal("0.01"), ROUND_HALF_UP)

        return jsonify({
            "monto_total_final": float(monto_total),
            "monto_pagado": float(monto_pagado),
            "vuelto": float(vuelto)
        })

    # Capturar InvalidOperation aquí también
    except (InvalidOperation, TypeError, ValueError):
        return jsonify({"error": "Montos inválidos. Asegúrate de enviar números válidos como strings."}), 400
    except Exception as e:
        print(f"ERROR [calcular_vuelto]: Excepción inesperada")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor"}), 500


# --- Endpoint: Obtener Ventas (Lista) ---
@ventas_bp.route('/obtener_todas', methods=['GET'])
def obtener_ventas():
    """Obtiene una lista de ventas, con filtros opcionales y paginación."""
    try:
        query = Venta.query.options(
            selectinload(Venta.usuario_interno) # Cargar usuario para resumen
        )

        # --- Aplicar Filtros ---
        usuario_id_filtro = request.args.get('usuario_id', type=int)
        if usuario_id_filtro: query = query.filter(Venta.usuario_interno_id == usuario_id_filtro)
        cliente_id_filtro = request.args.get('cliente_id', type=int)
        if cliente_id_filtro: query = query.filter(Venta.cliente_id == cliente_id_filtro)
        # ... (filtros de fecha como estaban) ...
        fecha_desde_str = request.args.get('fecha_desde')
        if fecha_desde_str:
            try:
                fecha_desde = datetime.date.fromisoformat(fecha_desde_str)
                query = query.filter(Venta.fecha_registro >= datetime.datetime.combine(fecha_desde, datetime.time.min))
            except ValueError: return jsonify({"error": "Formato 'fecha_desde' (YYYY-MM-DD)"}), 400
        fecha_hasta_str = request.args.get('fecha_hasta')
        if fecha_hasta_str:
             try:
                 fecha_hasta = datetime.date.fromisoformat(fecha_hasta_str)
                 query = query.filter(Venta.fecha_registro < datetime.datetime.combine(fecha_hasta + datetime.timedelta(days=1), datetime.time.min))
             except ValueError: return jsonify({"error": "Formato 'fecha_hasta' (YYYY-MM-DD)"}), 400

        # Ordenar
        query = query.order_by(Venta.fecha_registro.desc())

        # Paginación
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        paginated_ventas = query.paginate(page=page, per_page=per_page, error_out=False)
        ventas_db = paginated_ventas.items

        # Serializar Resultados
        ventas_list = [venta_a_dict_resumen(v) for v in ventas_db]

        return jsonify({
            "ventas": ventas_list,
            "pagination": {
                "total_items": paginated_ventas.total,
                "total_pages": paginated_ventas.pages,
                "current_page": page,
                "per_page": per_page,
                "has_next": paginated_ventas.has_next,
                "has_prev": paginated_ventas.has_prev
            }
        })
    except Exception as e:
        print(f"ERROR [obtener_ventas]: Excepción inesperada")
        traceback.print_exc()
        return jsonify({"error": "Error interno al obtener las ventas"}), 500


# --- Endpoint: Obtener Venta Específica (con Detalles) ---
@ventas_bp.route('/obtener/<int:venta_id>', methods=['GET'])
def obtener_venta_por_id(venta_id):
    """Obtiene los detalles completos de una venta específica."""
    try:
        venta_db = db.session.query(Venta).options(
            selectinload(Venta.detalles).selectinload(DetalleVenta.producto), # Cargar detalles y producto
            selectinload(Venta.usuario_interno) # Cargar usuario
        ).get(venta_id)

        if not venta_db:
            return jsonify({"error": "Venta no encontrada"}), 404

        return jsonify(venta_a_dict_completo(venta_db))
    except Exception as e:
        print(f"ERROR [obtener_venta_por_id]: Excepción inesperada para venta {venta_id}")
        traceback.print_exc()
        return jsonify({"error": "Error interno al obtener la venta"}), 500


# --- Endpoint: Actualizar Venta (Campos básicos) ---
@ventas_bp.route('/actualizar/<int:venta_id>', methods=['PUT'])
def actualizar_venta(venta_id):
    """Actualiza campos básicos de una venta (ej: observaciones). NO recalcula."""
    venta_db = db.session.get(Venta, venta_id)
    if not venta_db: return jsonify({"error": "Venta no encontrada"}), 404

    data = request.get_json()
    if not data: return jsonify({"error": "Payload JSON vacío"}), 400

    try:
        # Actualizar solo campos permitidos (ejemplos)
        campos_actualizables = ['cliente_id', 'fecha_pedido', 'direccion_entrega',
                                'cuit_cliente', 'observaciones', 'forma_pago',
                                'requiere_factura', 'monto_pagado_cliente'] # ¿Permitir cambiar estos?

        for campo in campos_actualizables:
            if campo in data:
                # Validar tipo si es necesario (ej: fecha_pedido a datetime)
                if campo == 'fecha_pedido' and data[campo]:
                     try:
                         setattr(venta_db, campo, datetime.datetime.fromisoformat(data[campo]))
                     except ValueError:
                         return jsonify({"error": f"Formato inválido para '{campo}' (usar ISO 8601)"}), 400
                elif campo in ['monto_pagado_cliente'] and data[campo] is not None:
                    try:
                        setattr(venta_db, campo, Decimal(str(data[campo])))
                    except InvalidOperation:
                         return jsonify({"error": f"Valor inválido para '{campo}'"}), 400
                else:
                     setattr(venta_db, campo, data[campo]) # Asignación directa

        # ¿Recalcular vuelto si cambia monto_pagado? Sí.
        if 'monto_pagado_cliente' in data and venta_db.monto_final_con_recargos is not None:
             _, _, _, vuelto_recalc, error_vuelto = calcular_monto_final_y_vuelto(
                 venta_db.monto_final_con_recargos, # Usar el monto final ya guardado
                 venta_db.forma_pago,
                 venta_db.requiere_factura,
                 data['monto_pagado_cliente'] # Usar el nuevo monto pagado
             )
             if error_vuelto:
                 print(f"WARN [actualizar_venta]: No se pudo recalcular vuelto: {error_vuelto}")
                 # ¿Fallar la actualización? O solo no actualizar el vuelto?
                 # Por ahora, no actualizamos vuelto si hay error.
                 venta_db.vuelto_calculado = None
             else:
                 venta_db.vuelto_calculado = vuelto_recalc

        db.session.commit()
        print(f"INFO: Venta actualizada: ID {venta_id}")
        return jsonify(venta_a_dict_completo(venta_db))

    except Exception as e:
        db.session.rollback()
        print(f"ERROR [actualizar_venta]: Excepción inesperada para venta {venta_id}")
        traceback.print_exc()
        return jsonify({"error": "Error interno al actualizar la venta"}), 500

# --- Endpoint: Eliminar Venta ---
@ventas_bp.route('/eliminar/<int:venta_id>', methods=['DELETE'])
def eliminar_venta(venta_id):
    """Elimina una venta y sus detalles."""
    venta_db = db.session.get(Venta, venta_id)
    if not venta_db: return jsonify({"error": "Venta no encontrada"}), 404

    try:
        # Lógica de negocio: ¿Se puede borrar? (ej: si ya fue facturada, etc.)
        # if venta_db.esta_facturada: return jsonify({"error":"No se puede borrar venta facturada"}), 403

        db.session.delete(venta_db) # Cascade borrará detalles
        db.session.commit()
        print(f"INFO: Venta eliminada: ID {venta_id}")
        return jsonify({"message": f"Venta ID {venta_id} eliminada"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"ERROR [eliminar_venta]: Excepción inesperada para venta {venta_id}")
        traceback.print_exc()
        return jsonify({"error": "Error interno al eliminar la venta"}), 500


# --- Endpoint para Generar Comprobante HTML ---
@ventas_bp.route('/obtener_comprobante/<int:venta_id>/comprobante', methods=['GET'])
def obtener_comprobante_venta(venta_id):
    """Genera y devuelve un HTML formateado como comprobante no fiscal."""
    try:
        venta_db = db.session.query(Venta).options(
            selectinload(Venta.detalles).selectinload(DetalleVenta.producto),
            selectinload(Venta.usuario_interno)
        ).get(venta_id)

        if not venta_db: return "<h1>Venta no encontrada</h1>", 404

        # Serializar usando la función actualizada
        venta_dict = venta_a_dict_completo(venta_db)

        # Crear contexto para la plantilla
        context = {
            "venta": venta_dict,
            "RECARGO_TRANSFERENCIA_PORC": RECARGO_TRANSFERENCIA_PORC,
            "RECARGO_FACTURA_PORC": RECARGO_FACTURA_PORC
        }

        html_comprobante = render_template('comprobante_venta.html', **context)
        response = make_response(html_comprobante)
        response.headers['Content-Type'] = 'text/html'
        return response

    except Exception as e:
        print(f"ERROR [obtener_comprobante_venta]: Excepción inesperada para venta {venta_id}")
        traceback.print_exc()
        return f"<h1>Error interno del servidor</h1><p>No se pudo generar el comprobante: {e}</p>", 500


# --- Funciones Auxiliares para Serializar Venta/Detalle (Actualizadas) ---

def venta_a_dict_resumen(venta):
    """Convierte Venta a diccionario para listas (incluyendo campos nuevos)."""
    if not venta: return None
    return {
        "venta_id": venta.id,
        "fecha_registro": venta.fecha_registro.isoformat() if venta.fecha_registro else None,
        "fecha_pedido": venta.fecha_pedido.isoformat() if venta.fecha_pedido else None,
        "usuario_interno_id": venta.usuario_interno_id,
        "usuario_nombre": venta.usuario_interno.nombre if venta.usuario_interno else None,
        "cliente_id": venta.cliente_id,
        "cuit_cliente": venta.cuit_cliente,
        "monto_total_base": float(venta.monto_total) if venta.monto_total is not None else None,
        "forma_pago": venta.forma_pago,
        "requiere_factura": venta.requiere_factura,
        "monto_final_con_recargos": float(venta.monto_final_con_recargos) if venta.monto_final_con_recargos is not None else None,
    }

def venta_a_dict_completo(venta):
    """Convierte Venta a diccionario completo (incluyendo campos nuevos y detalles)."""
    if not venta: return None
    # Obtener detalles usando .all() si la relación es lazy='dynamic'
    detalles_list = venta.detalles.all() if hasattr(venta.detalles, 'all') else venta.detalles

    resumen = venta_a_dict_resumen(venta)
    resumen.update({
        "direccion_entrega": venta.direccion_entrega,
        "observaciones": venta.observaciones,
        "recargos": {
            "transferencia": float(venta.recargo_transferencia) if venta.recargo_transferencia is not None else 0.0,
            "factura_iva": float(venta.recargo_factura) if venta.recargo_factura is not None else 0.0,
        },
        "monto_pagado_cliente": float(venta.monto_pagado_cliente) if venta.monto_pagado_cliente is not None else None,
        "vuelto_calculado": float(venta.vuelto_calculado) if venta.vuelto_calculado is not None else None,
        "detalles": [detalle_venta_a_dict(d) for d in detalles_list]
    })
    return resumen

def detalle_venta_a_dict(detalle):
    """Convierte DetalleVenta a diccionario."""
    if not detalle: return None
    return {
        "detalle_id": detalle.id,
        "producto_id": detalle.producto_id,
        "producto_codigo": detalle.producto.id if detalle.producto else None,
        "producto_nombre": detalle.producto.nombre if detalle.producto else None,
        "cantidad": float(detalle.cantidad) if detalle.cantidad is not None else None,
        "margen_aplicado": float(detalle.margen_aplicado) if detalle.margen_aplicado is not None else None,
        "costo_unitario_momento_ars": float(detalle.costo_unitario_momento_ars) if detalle.costo_unitario_momento_ars is not None else None,
        "coeficiente_usado": float(detalle.coeficiente_usado) if detalle.coeficiente_usado is not None else None,
        "precio_unitario_venta_ars": float(detalle.precio_unitario_venta_ars) if detalle.precio_unitario_venta_ars is not None else None,
        "precio_total_item_ars": float(detalle.precio_total_item_ars) if detalle.precio_total_item_ars is not None else None,
    }