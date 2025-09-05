# app/blueprints/ventas.py

from operator import or_
from flask import Blueprint, request, jsonify, render_template, make_response
from sqlalchemy.orm import selectinload
from sqlalchemy import func
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP, ROUND_UP
import math
import traceback
from ..utils import precios_utils
from datetime import datetime, timezone, date
# --- Imports locales ---
from .. import db
from ..models import ( Venta, DetalleVenta, Producto, UsuarioInterno, Cliente, # Añadido Cliente
                      TipoCambio, PrecioEspecialCliente ) # Añadido PrecioEspecialCliente
# Ajusta la ruta si es necesario para estas funciones auxiliares
# Asumiendo que están en productos.py dentro de blueprints, o muévelas a utils si prefieres

# Importar decoradores/roles (descomenta si los usas)
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES

# --- Blueprint ---
ventas_bp = Blueprint('ventas', __name__, url_prefix='/ventas')

# --- Constantes de Recargo ---
RECARGO_TRANSFERENCIA_PORC = Decimal("10.5") # 10.5%
RECARGO_FACTURA_PORC = Decimal("21.0") # 21.0% (IVA)
VENDEDORES = ["pedidos","martin", "moises", "sergio", "gabriel", "mauricio", "elias", "ardiles", "redonedo"]

# --- Función Auxiliar para calcular precio item VENTA (MODIFICADA con Precio Especial) ---
def calcular_precio_item_venta(producto_id, cantidad_decimal, cliente_id=None):
    """
    Calcula el precio unitario y total para un item de venta.
    Utiliza la lógica híbrida: "Múltiplos de Escalón" para cant < 1 y "Cálculo Total Directo" para cant >= 1.
    Devuelve: (precio_unitario_ars, precio_total_ars, costo_momento_ars, coeficiente_decimal, error_msg, es_precio_especial)
    """
    from .productos import (
        calcular_costo_producto_referencia, 
        obtener_coeficiente_por_rango, 
        redondear_a_siguiente_decena
    )
    
    print(f"DEBUG [calcular_precio_item_venta]: Calculando para ProdID={producto_id}, Cant={cantidad_decimal}, ClienteID={cliente_id}")
    try:
        producto = db.session.get(Producto, producto_id)
        if not producto:
            return None, None, None, None, f"Producto ID {producto_id} no encontrado.", False

        # --- Búsqueda de Precio Especial (sin cambios) ---
        if cliente_id:
            precio_especial_activo = db.session.query(PrecioEspecialCliente).filter(
                PrecioEspecialCliente.cliente_id == cliente_id,
                PrecioEspecialCliente.producto_id == producto_id,
                PrecioEspecialCliente.activo == True
            ).first()
            if precio_especial_activo and precio_especial_activo.precio_unitario_fijo_ars is not None:
                precio_unitario_fijo = precio_especial_activo.precio_unitario_fijo_ars
                precio_total_fijo = (precio_unitario_fijo * cantidad_decimal).quantize(Decimal("0.01"), ROUND_HALF_UP)
                costo_ref_usd_calc = calcular_costo_producto_referencia(producto_id)
                costo_momento_ars_calc = None
                return precio_unitario_fijo, precio_total_fijo, costo_momento_ars_calc, None, None, True

        # --- Cálculo Dinámico (con correcciones) ---
        costo_ref_usd = calcular_costo_producto_referencia(producto_id)
        if costo_ref_usd is None:
             raise ValueError(f"No se pudo calcular el costo base USD.")

        # ... (Cálculo de precio_base_con_margen_ars - sin cambios) ...
        nombre_tc_aplicar = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
        tipo_cambio = TipoCambio.query.filter_by(nombre=nombre_tc_aplicar).first()
        if not tipo_cambio or tipo_cambio.valor is None or tipo_cambio.valor <= 0: raise ValueError(f"Tipo de cambio '{nombre_tc_aplicar}' no válido.")
        valor_tc_decimal = Decimal(str(tipo_cambio.valor))
        costo_momento_ars = (costo_ref_usd * valor_tc_decimal)
        margen = Decimal(str(producto.margen or '0.0'))
        denominador = Decimal(1) - margen
        if denominador <= 0: raise ValueError("Margen inválido.")
        precio_base_con_margen_ars = costo_momento_ars / denominador

        # --- Obtención y uso correcto de los datos del coeficiente ---
        tipo_calculo = producto.tipo_calculo
        ref_calculo_str = str(producto.ref_calculo or '')
        cantidad_str = str(cantidad_decimal)

        resultado_calculadora = obtener_coeficiente_por_rango(ref_calculo_str, cantidad_str, tipo_calculo)
        if resultado_calculadora is None:
            raise ValueError(f"No se encontró coeficiente aplicable.")

        coeficiente_str, escalon_cantidad_str = resultado_calculadora

        try:
            coeficiente_decimal = Decimal(coeficiente_str)
        except InvalidOperation:
            raise ValueError(f"Coeficiente obtenido ('{coeficiente_str}') no es un número válido.")
        
        precio_total_ars = None
        precio_unitario_ars = None
        
        if cantidad_decimal < Decimal('1.0'):
            # CORRECCIÓN 1: Usar la variable 'escalon_cantidad_str' que ya desempaquetamos
            escalon_cantidad = Decimal(escalon_cantidad_str)
            if escalon_cantidad == 0: raise ValueError("El escalón de cantidad no puede ser cero.")
            
            precio_del_escalon_bruto = precio_base_con_margen_ars * coeficiente_decimal
            # CORRECCIÓN 2: Asumir que redondear... devuelve UN solo valor. Quitar ', _'
            precio_del_escalon_redondeado = redondear_a_siguiente_decena(precio_del_escalon_bruto)
            numero_de_escalones = cantidad_decimal / escalon_cantidad
            
            precio_total_ars = precio_del_escalon_redondeado * numero_de_escalones
            precio_unitario_ars = precio_del_escalon_redondeado / escalon_cantidad
        else:
            precio_total_bruto_ars = (precio_base_con_margen_ars * cantidad_decimal) * coeficiente_decimal
            # CORRECCIÓN 2: Asumir que redondear... devuelve UN solo valor. Quitar ', _'
            precio_total_ars = redondear_a_siguiente_decena(precio_total_bruto_ars)
            
            if cantidad_decimal == 0: raise ValueError("La cantidad no puede ser cero.")
            precio_unitario_ars = (precio_total_ars / cantidad_decimal)

        precio_unitario_ars = precio_unitario_ars.quantize(Decimal("0.01"), ROUND_HALF_UP)
        precio_total_ars = precio_total_ars.quantize(Decimal("0.01"), ROUND_HALF_UP)
        
        return precio_unitario_ars, precio_total_ars, costo_momento_ars, coeficiente_decimal, None, False

    except ValueError as e:
        print(f"WARN [calcular_precio_item_venta]: Error VALOR para producto {producto_id}: {e}")
        return None, None, None, None, str(e), False
    except Exception as e:
        print(f"ERROR [calcular_precio_item_venta]: Excepción inesperada para producto {producto_id}: {type(e).__name__}")
        traceback.print_exc()
        return None, None, None, None, "Error interno al calcular precio del item.", False

# --- Función Auxiliar para calcular recargos y total final (sin cambios) ---
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

    # Aplicar recargo transferencia
    if forma_pago and isinstance(forma_pago, str) and forma_pago.strip().lower() == 'transferencia':
        recargo_calculado = (monto_actual * RECARGO_TRANSFERENCIA_PORC / Decimal(100)).quantize(Decimal("0.01"), ROUND_HALF_UP)
        recargo_t = recargo_calculado
        monto_actual += recargo_t
        print(f"DEBUG [calc_final]: Recargo Transferencia aplicado: {recargo_t}")

    # Aplicar recargo factura/IVA
    if requiere_factura: # Asume booleano
        recargo_calculado = (monto_actual * RECARGO_FACTURA_PORC / Decimal(100)).quantize(Decimal("0.01"), ROUND_HALF_UP)
        recargo_f = recargo_calculado
        monto_actual += recargo_f
        print(f"DEBUG [calc_final]: Recargo Factura aplicado: {recargo_f}")

    monto_final = monto_actual.quantize(Decimal("0.01"), ROUND_HALF_UP)

    # Calcular vuelto
    if monto_pagado is not None:
        try:
            # Convertir monto_pagado a Decimal (viene como string o None)
            monto_pagado_decimal = Decimal(str(monto_pagado)).quantize(Decimal("0.01"))
            if monto_pagado_decimal < monto_final:
                vuelto = Decimal("0.00")
                # faltante = (monto_final - monto_pagado_decimal).quantize(Decimal("0.01"), ROUND_HALF_UP)
                # error = f"Pago insuficiente. Monto pagado: {monto_pagado_decimal:.2f}, Total final: {monto_final:.2f}, Faltan: {faltante:.2f}"
                # print(f"WARN [calc_final]: {error}")
                # return monto_final, recargo_t, recargo_f, None, error
            else:
                vuelto = (monto_pagado_decimal - monto_final).quantize(Decimal("0.01"), ROUND_HALF_UP)
                print(f"DEBUG [calc_final]: Vuelto calculado: {vuelto}")
        except (InvalidOperation, TypeError):
             error = f"Monto pagado ('{monto_pagado}') inválido."
             print(f"WARN [calc_final]: {error}")
             # Devolver los montos calculados hasta ahora, pero indicar error en vuelto
             return monto_final, recargo_t, recargo_f, None, error

    return monto_final, recargo_t, recargo_f, vuelto, error # Devuelve error=None si todo ok


# --- Endpoint: Registrar Nueva Venta (MODIFICADO para pasar cliente_id) ---
@ventas_bp.route('/registrar', methods=['POST'])
@token_required
@roles_required(ROLES['VENTAS_LOCAL'], ROLES['VENTAS_PEDIDOS'], ROLES['ADMIN'])
def registrar_venta(current_user):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Payload JSON vacío"}), 400

    try:
        usuario_interno_id = data.get('usuario_interno_id')
        cliente_id = data.get('cliente_id')
        nombre_vendedor = data.get('nombre_vendedor')
        items_payload = data.get('items')
        forma_pago = data.get('forma_pago')
        # Guardar el payload recibido en un archivo JSON para debugging
        import json
        try:
            with open('/root/quimex_2.0/sistema_quimicos/registro_venta_debug.json', 'w') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            pass
        requiere_factura = data.get('requiere_factura', False)
        monto_pagado_str = data.get('monto_pagado_cliente')
        descuento_total_global_porc = Decimal(str(data.get('descuento_total_global_porcentaje', '0.0')))

        print("--- REGISTRO DE VENTA ---")
        print(f"Usuario: {usuario_interno_id}, Cliente: {cliente_id}, Vendedor: {nombre_vendedor}")
        print(f"Forma de pago: {forma_pago}, Requiere factura: {requiere_factura}")
        print(f"Items recibidos: {len(items_payload) if items_payload else 0}")
        if items_payload:
            for idx, item_data in enumerate(items_payload):
                print(f"  Item {idx+1}: producto_id={item_data.get('producto_id')}, cantidad={item_data.get('cantidad')}, precio_unitario_venta_ars={item_data.get('precio_unitario_venta_ars')}, precio_total_item_ars={item_data.get('precio_total_item_ars')}, descuento_item_porcentaje={item_data.get('descuento_item_porcentaje')}")

        if not all([usuario_interno_id, items_payload is not None, nombre_vendedor]):
            return jsonify({"error": "Faltan campos requeridos"}), 400
        if nombre_vendedor.lower() not in VENDEDORES:
            return jsonify({"error": f"Vendedor '{nombre_vendedor}' no es válido."}), 400

        monto_total_base_neto = Decimal("0.00")
        detalles_venta_db = []

        for item_data in items_payload:
            producto_id = item_data.get("producto_id")
            cantidad = Decimal(str(item_data.get("cantidad", "0")))
            descuento_item_porc = Decimal(str(item_data.get("descuento_item_porcentaje", "0.0")))
            if cantidad <= 0:
                continue
            # Use frontend-sent unit price and total if present
            precio_u_bruto = item_data.get("precio_unitario_venta_ars")
            precio_t_bruto = item_data.get("precio_total_item_ars")
            costo_u = None
            error_msg = None
            if precio_u_bruto is not None and precio_t_bruto is not None:
                try:
                    precio_u_bruto = Decimal(str(precio_u_bruto))
                    precio_t_bruto = Decimal(str(precio_t_bruto))
                    precio_t_neto_item = precio_t_bruto
                except Exception:
                    return jsonify({"error": f"Precio unitario o total inválido para Prod ID {producto_id}"}), 400
            else:
                precio_u_bruto, precio_t_bruto, costo_u, _, error_msg, _ = calcular_precio_item_venta(producto_id, cantidad, cliente_id)
                if error_msg:
                    return jsonify({"error": f"Error en Prod ID {producto_id}: {error_msg}"}), 400
                precio_t_neto_item = precio_t_bruto * (Decimal(1) - descuento_item_porc / Decimal(100))
            # Redondear precio_total_item_ars a múltiplo de 100
            if precio_t_neto_item % 100 != 0:
                precio_t_neto_item = Decimal(math.ceil(precio_t_neto_item / 100) * 100)
            detalle = DetalleVenta(
                producto_id=producto_id, cantidad=cantidad,
                precio_unitario_venta_ars=precio_u_bruto,
                precio_total_item_ars=precio_t_neto_item,
                costo_unitario_momento_ars=costo_u,
                descuento_item=descuento_item_porc,  # Guardar el porcentaje real
                observacion_item=item_data.get("observacion_item")
            )
            detalles_venta_db.append(detalle)
            monto_total_base_neto += precio_t_neto_item

        print(f"Suma monto_total_base_neto antes de redondear: {monto_total_base_neto}")
        monto_total_base_neto = monto_total_base_neto.quantize(Decimal("0.01"), ROUND_HALF_UP)
        monto_con_recargos, recargo_t_calc, recargo_f_calc, _, _ = calcular_monto_final_y_vuelto(monto_total_base_neto, forma_pago, requiere_factura)
        monto_final_a_pagar = monto_con_recargos * (Decimal(1) - descuento_total_global_porc / Decimal(100))
        # Redondear a múltiplo de 100 hacia arriba
        monto_final_a_pagar = Decimal(math.ceil(monto_final_a_pagar / 100) * 100)
        print(f"Suma monto_total_base_neto después de redondear: {monto_total_base_neto}")
        print(f"Recargos calculados: transferencia={recargo_t_calc}, factura={recargo_f_calc}")
        print(f"Monto final a pagar (redondeado): {monto_final_a_pagar}")

        # --- CORRECCIÓN LÓGICA DE VUELTO ---
        vuelto_final_calc = Decimal('0.00')
        if monto_pagado_str is not None:
            try:
                monto_pagado_decimal = Decimal(str(monto_pagado_str))
                if monto_pagado_decimal >= monto_final_a_pagar:
                    vuelto_final_calc = monto_pagado_decimal - monto_final_a_pagar
                # La validación estricta solo aplica si NO es un pedido y se paga en efectivo
                # elif nombre_vendedor.lower() != 'pedidos' and forma_pago == 'efectivo':
                #     return jsonify({"error": "Para pagos en efectivo en puerta, el monto pagado no puede ser menor al total."}), 400
            except InvalidOperation:
                return jsonify({"error": "Monto pagado inválido."}), 400

        print(f"Valores que se guardarán en Venta: monto_total={monto_total_base_neto}, monto_final_con_recargos={monto_final_a_pagar}, monto_pagado_cliente={monto_pagado_str}, vuelto_calculado={vuelto_final_calc}")
        nueva_venta = Venta(
            usuario_interno_id=usuario_interno_id,
            cliente_id=cliente_id,
            nombre_vendedor=nombre_vendedor,
            fecha_pedido=datetime.fromisoformat(data['fecha_pedido']) if data.get('fecha_pedido') else datetime.now(timezone.utc),
            observaciones=data.get('observaciones', ""),
            monto_total=monto_total_base_neto,
            forma_pago=forma_pago,
            requiere_factura=requiere_factura,
            recargo_transferencia=recargo_t_calc,
            recargo_factura=recargo_f_calc,
            monto_final_con_recargos=data.get('monto_final_con_recargos'),
            monto_final_redondeado=monto_final_a_pagar,
            monto_pagado_cliente=Decimal(str(monto_pagado_str)).quantize(Decimal("0.01")) if monto_pagado_str else None,
            vuelto_calculado=vuelto_final_calc.quantize(Decimal("0.01"), ROUND_HALF_UP),
            detalles=detalles_venta_db,
            descuento_general=descuento_total_global_porc,  # Guardar el porcentaje real
            direccion_entrega=data.get('direccion_entrega', "")
        )
        db.session.add(nueva_venta)
        db.session.commit()
        return jsonify({"status": "success", "venta_id": nueva_venta.id}), 201

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": f"Error interno del servidor: {str(e)}"}), 500


# --- Endpoint: /calcular_total (sin cambios) ---
@ventas_bp.route('/calcular_total', methods=['POST'])
def calcular_total_venta():
    """Calcula el monto final con recargos sin registrar la venta."""
    data = request.get_json()
    if not data or 'monto_base' not in data:
        return jsonify({"error": "Falta 'monto_base' en el payload"}), 400
    try:
        monto_base_str = str(data['monto_base'])
        forma_pago = data.get('forma_pago')
        requiere_factura = data.get('requiere_factura', False)
        monto_final, recargo_t, recargo_f, _, error_msg = calcular_monto_final_y_vuelto(
            monto_base_str, forma_pago, requiere_factura, None
        )
        if error_msg:
            return jsonify({"error": error_msg}), 400
        # Redondear a múltiplo de 100 hacia arriba
        import math
        monto_final_redondeado = float(Decimal(math.ceil(monto_final / 100) * 100))
        respuesta = {
            "monto_base": float(Decimal(monto_base_str).quantize(Decimal("0.01"))),
            "forma_pago_aplicada": forma_pago,
            "requiere_factura_aplicada": requiere_factura,
            "recargos": { "transferencia": float(recargo_t), "factura_iva": float(recargo_f) },
            "monto_final_con_recargos": monto_final_redondeado
        }
        return jsonify(respuesta)
    except (InvalidOperation, TypeError, ValueError):
        return jsonify({"error": "Monto base inválido"}), 400
    except Exception as e:
        print(f"ERROR [calcular_total_venta]: Excepción {e}")
        traceback.print_exc()
        return jsonify({"error":"ISE"}),500

# --- Endpoint: /calcular_vuelto (sin cambios) ---
@ventas_bp.route('/calcular_vuelto', methods=['POST'])
def calcular_vuelto():
    """Calcula el vuelto dados un total final y un monto pagado."""
    data = request.get_json()
    if not data or 'monto_total_final' not in data or 'monto_pagado' not in data:
        return jsonify({"error": "Faltan 'monto_total_final' o 'monto_pagado'"}), 400
    try:
        monto_total = Decimal(str(data['monto_total_final'])).quantize(Decimal("0.01"))
        monto_pagado = Decimal(str(data['monto_pagado'])).quantize(Decimal("0.01"))
        if monto_pagado < monto_total:
             faltante = (monto_total - monto_pagado).quantize(Decimal("0.01"))
             return jsonify({"error": "Pago insuficiente", "vuelto": None, "faltante": float(faltante) }), 400
        vuelto = (monto_pagado - monto_total).quantize(Decimal("0.01"), ROUND_HALF_UP)
        return jsonify({"monto_total_final": float(monto_total), "monto_pagado": float(monto_pagado), "vuelto": float(vuelto)})
    except (InvalidOperation, TypeError, ValueError): return jsonify({"error": "Montos inválidos"}), 400
    except Exception as e: print(f"ERROR [calcular_vuelto]: Excepción {e}"); traceback.print_exc(); return jsonify({"error":"ISE"}),500

# --- Endpoint: Obtener Ventas (Lista) (Añadido cliente a eager load) ---
@ventas_bp.route('/obtener_todas', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['CONTABLE'], ROLES['VENTAS_PEDIDOS'], ROLES['VENTAS_LOCAL'])
def obtener_ventas(current_user):
    """Obtiene una lista de ventas, con filtros opcionales y paginación. Optimizada con Eager Loading."""
    try:
        # APLICADO: Eager loading para prevenir N+1 y asegurar que los datos estén disponibles
        query = Venta.query.options(
            selectinload(Venta.usuario_interno),
            selectinload(Venta.cliente)
        )

        # --- Aplicar Filtros (sin cambios) ---
        usuario_id_filtro = request.args.get('usuario_id', type=int)
        if usuario_id_filtro:
            query = query.filter(Venta.usuario_interno_id == usuario_id_filtro)
        cliente_id_filtro = request.args.get('cliente_id', type=int)
        if cliente_id_filtro:
            query = query.filter(Venta.cliente_id == cliente_id_filtro)
        fecha_desde_str = request.args.get('fecha_desde')
        if fecha_desde_str:
            try:
                fecha_desde = datetime.date.fromisoformat(fecha_desde_str)
                query = query.filter(Venta.fecha_registro >= datetime.datetime.combine(fecha_desde, datetime.time.min))
            except ValueError:
                return jsonify({"error": "Formato 'fecha_desde' (YYYY-MM-DD)"}), 400
        fecha_hasta_str = request.args.get('fecha_hasta')
        if fecha_hasta_str:
            try:
                fecha_hasta = datetime.date.fromisoformat(fecha_hasta_str)
                query = query.filter(Venta.fecha_registro < datetime.datetime.combine(fecha_hasta + datetime.timedelta(days=1), datetime.time.min))
            except ValueError:
                return jsonify({"error": "Formato 'fecha_hasta' (YYYY-MM-DD)"}), 400

        # Ordenar (sin cambios)
        query = query.order_by(Venta.fecha_registro.desc())

        # Paginación (sin cambios)
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        paginated_ventas = query.paginate(page=page, per_page=per_page, error_out=False)
        ventas_db = paginated_ventas.items

        # Serializar Resultados (sin cambios, ahora con los objetos cargados)
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

# --- Endpoint: Obtener Venta Específica (Añadido cliente a eager load) ---
@ventas_bp.route('/obtener/<int:venta_id>', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['VENTAS_PEDIDOS'], ROLES['VENTAS_LOCAL']) # O los roles apropiados
def obtener_venta_por_id(current_user, venta_id):
    """Obtiene los detalles completos de una venta, compatible con lazy='dynamic'."""
    try:
        # Paso 1: Obtener el objeto 'Venta' principal. db.session.get es la forma más eficiente por ID.
        venta_db = db.session.get(Venta, venta_id)

        if not venta_db:
            return jsonify({"error": "Venta no encontrada"}), 404

        # Paso 2: El acceso a venta_db.detalles, venta_db.cliente, etc.,
        # hará que SQLAlchemy los cargue automáticamente cuando sea necesario
        # al llamar a la función de serialización.

        # Paso 3: Serializar el objeto. La función de serialización se encargará de acceder a las relaciones.
        return jsonify(venta_a_dict_completo(venta_db))

    except Exception as e:
        print(f"ERROR [obtener_venta_por_id]: Excepción inesperada para venta {venta_id}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al obtener la venta."}), 500


# --- Endpoint: Actualizar Venta (Lógica de Recálculo Completo) ---
@ventas_bp.route('/actualizar/<int:venta_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['VENTAS_PEDIDOS'], ROLES['VENTAS_LOCAL'])
def actualizar_venta(current_user, venta_id):
    """
    [CORREGIDO] Actualiza una venta existente. Siempre recalcula todos los precios
    y totales desde el backend para garantizar la consistencia.
    """
    venta_db = db.session.get(Venta, venta_id)
    if not venta_db:
        return jsonify({"error": "Venta no encontrada"}), 404

    current_date = date.today()

    fecha_registro = venta_db.fecha_registro
    if isinstance(fecha_registro, str):
        fecha_registro = datetime.fromisoformat(fecha_registro).date()
    else:
        fecha_registro = fecha_registro.date()

    # Solo restringir para NO-ADMIN
    if venta_db.direccion_entrega == "":
        if fecha_registro != current_date and getattr(current_user, 'rol', None) != 'ADMIN':
            return jsonify({
                "error": "La boleta que desea actualizar no corresponde al día de la fecha"
            }), 400
        
    data = request.get_json()
    if not data or not isinstance(data.get('items'), list):
        return jsonify({"error": "Payload JSON inválido o sin lista de 'items'"}), 400
        
    try:
        # --- BLOQUE 1: RE-CÁLCULO DE ÍTEMS Y MONTO BASE ---
        DetalleVenta.query.filter_by(venta_id=venta_id).delete()
        db.session.flush()

        monto_total_base_nuevo = Decimal("0.00")
        detalles_venta_nuevos = []
        cliente_id_nuevo = data.get('cliente_id', venta_db.cliente_id)

        for item_data in data.get('items', []):
            producto_id = item_data.get("producto_id")
            cantidad = Decimal(str(item_data.get("cantidad", "0")))
            descuento_item_porc = Decimal(str(item_data.get("descuento_item_porcentaje", "0.0")))
            if not producto_id or cantidad <= 0:
                continue
            # SIEMPRE recalcular los valores desde el backend
            precio_u_bruto, precio_t_bruto, costo_u, _, error_msg, _ = calcular_precio_item_venta(
                producto_id, cantidad, cliente_id_nuevo
            )
            if error_msg:
                db.session.rollback()
                return jsonify({"error": f"Error al recalcular ítem (Prod ID {producto_id}): {error_msg}"}), 400
            # Aplicar descuento y redondeo al precio total
            precio_t_neto_item = precio_t_bruto * (Decimal(1) - descuento_item_porc / Decimal(100))
            if precio_t_neto_item % 100 != 0:
                precio_t_neto_item = Decimal(math.ceil(precio_t_neto_item / 100) * 100)
            # Calcular el precio unitario redondeado
            if cantidad > 0:
                precio_u_neto_item = (precio_t_neto_item / cantidad).quantize(Decimal("0.01"), ROUND_HALF_UP)
            else:
                precio_u_neto_item = precio_u_bruto
            detalle_nuevo = DetalleVenta(
                venta_id=venta_id,  # <-- Asignar explícitamente el ID de la venta
                producto_id=producto_id,
                cantidad=cantidad,
                precio_unitario_venta_ars=precio_u_neto_item,
                precio_total_item_ars=precio_t_neto_item,
                costo_unitario_momento_ars=costo_u,
                descuento_item=descuento_item_porc,  # Guardar el porcentaje real
                observacion_item=item_data.get("observacion_item")
            )
            detalles_venta_nuevos.append(detalle_nuevo)
            monto_total_base_nuevo += precio_t_neto_item

        # --- BLOQUE 2: GUARDAR LOS MONTOS ENVIADOS POR EL FRONTEND SI ESTÁN PRESENTES ---
        forma_pago_nueva = data.get('forma_pago', venta_db.forma_pago)
        requiere_factura_nueva = data.get('requiere_factura', venta_db.requiere_factura)
        monto_pagado_nuevo_str = data.get('monto_pagado_cliente')
        descuento_total_nuevo_porc = Decimal(str(data.get('descuento_total_global_porcentaje', '0.0')))
        fecha_pedido = data.get('fecha_pedido', None)

        # Si el frontend envía los montos, los usamos directamente
        monto_total_base_nuevo = Decimal(str(data.get('monto_total_base', monto_total_base_nuevo))).quantize(Decimal("0.01"), ROUND_HALF_UP)
        monto_final_a_pagar_nuevo = Decimal(str(data.get('monto_final_con_recargos', monto_total_base_nuevo))).quantize(Decimal("0.01"), ROUND_HALF_UP)

        # Recargos: si el frontend los envía, los usamos; si no, los calculamos
        recargo_t_nuevo = Decimal(str(data.get('recargo_transferencia', 0.0)))
        recargo_f_nuevo = Decimal(str(data.get('recargo_factura', 0.0)))

        vuelto_final_nuevo = Decimal('0.00')
        if monto_pagado_nuevo_str is not None:
            try:
                monto_pagado_decimal = Decimal(str(monto_pagado_nuevo_str))
                if monto_pagado_decimal >= monto_final_a_pagar_nuevo:
                    vuelto_final_nuevo = monto_pagado_decimal - monto_final_a_pagar_nuevo
            except InvalidOperation:
                return jsonify({"error": "Monto pagado inválido."}), 400

        # --- BLOQUE 3: ACTUALIZACIÓN DEL OBJETO VENTA EN LA BASE DE DATOS ---
        venta_db.cliente_id = cliente_id_nuevo
        venta_db.observaciones = data.get('observaciones', venta_db.observaciones)
        venta_db.monto_total = monto_total_base_nuevo
        venta_db.forma_pago = forma_pago_nueva
        venta_db.requiere_factura = requiere_factura_nueva
        venta_db.recargo_transferencia = recargo_t_nuevo
        venta_db.recargo_factura = recargo_f_nuevo
        venta_db.monto_final_con_recargos = monto_final_a_pagar_nuevo
        venta_db.monto_final_redondeado = monto_final_a_pagar_nuevo
        venta_db.monto_pagado_cliente = Decimal(str(monto_pagado_nuevo_str)).quantize(Decimal("0.01")) if monto_pagado_nuevo_str is not None else None
        venta_db.vuelto_calculado = vuelto_final_nuevo.quantize(Decimal("0.01"), ROUND_HALF_UP)
        venta_db.detalles = detalles_venta_nuevos
        # Solo actualizar si viene un valor válido y no vacío
        if fecha_pedido:
            try:
                if isinstance(fecha_pedido, datetime):
                    venta_db.fecha_pedido = fecha_pedido
                else:
                    venta_db.fecha_pedido = datetime.fromisoformat(fecha_pedido)
            except Exception:
                pass
        venta_db.descuento_general = descuento_total_nuevo_porc  # Guardar el porcentaje real
        venta_db.direccion_entrega = data.get('direccion_entrega', venta_db.direccion_entrega)
        # Nota: El 'nombre_vendedor' y el 'estado' no se tocan aquí, se manejan en otro endpoint

        db.session.commit()

        # --- FIX REFORZADO: Volver a consultar la venta desde cero para asegurar datos frescos ---
        venta_actualizada = db.session.query(Venta).options(
            selectinload(Venta.detalles).selectinload(DetalleVenta.producto),
            selectinload(Venta.cliente)
        ).get(venta_id)

        return jsonify({
            "status": "success",
            "message": "Venta actualizada con éxito",
            "venta": venta_a_dict_completo(venta_actualizada)
        }), 200
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": f"Error interno del servidor: {str(e)}"}), 500
    

@ventas_bp.route('/sin_entrega', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['CONTABLE'], ROLES['VENTAS_PEDIDOS'], ROLES['VENTAS_LOCAL'])
def obtener_ventas_sin_entrega(current_user):
    """
    Obtiene ventas para retiro en local, optimizada con Eager Loading.
    """
    try:
        # CORRECCIÓN: Se añade Eager Loading para consistencia y rendimiento
        query = Venta.query.options(
            selectinload(Venta.usuario_interno),
            selectinload(Venta.cliente)
        ).filter(
            or_(
                Venta.direccion_entrega.is_(None),
                Venta.direccion_entrega == ''
            )
        )

        # (El resto del código de la función se mantiene igual, no necesita cambios)
        usuario_id_filtro = request.args.get('usuario_id', type=int)
        if usuario_id_filtro:
            query = query.filter(Venta.usuario_interno_id == usuario_id_filtro)
        cliente_id_filtro = request.args.get('cliente_id', type=int)
        if cliente_id_filtro:
            query = query.filter(Venta.cliente_id == cliente_id_filtro)
        fecha_desde_str = request.args.get('fecha_desde')
        if fecha_desde_str:
            try:
                fecha_desde = datetime.date.fromisoformat(fecha_desde_str)
                query = query.filter(Venta.fecha_registro >= datetime.datetime.combine(fecha_desde, datetime.time.min))
            except ValueError:
                return jsonify({"error": "Formato 'fecha_desde' (YYYY-MM-DD)"}), 400
        fecha_hasta_str = request.args.get('fecha_hasta')
        if fecha_hasta_str:
            try:
                fecha_hasta = datetime.date.fromisoformat(fecha_hasta_str)
                query = query.filter(Venta.fecha_registro < datetime.datetime.combine(fecha_hasta + datetime.timedelta(days=1), datetime.time.min))
            except ValueError:
                return jsonify({"error": "Formato 'fecha_hasta' (YYYY-MM-DD)"}), 400
        query = query.order_by(Venta.fecha_registro.desc())
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        paginated_ventas = query.paginate(page=page, per_page=per_page, error_out=False)
        ventas_db = paginated_ventas.items
        ventas_list = [venta_a_dict_resumen(v) for v in ventas_db]
        # Guardar los argumentos de la consulta en un archivo JSON para debugging
        import json
        try:
            with open('/root/quimex_2.0/sistema_quimicos/ventas_sin_entrega_debug.json', 'w') as f:
                json.dump(dict(request.args), f, indent=2, ensure_ascii=False)
        except Exception as e:
            pass

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
        print(f"ERROR [obtener_ventas_sin_entrega]: Excepción inesperada")
        traceback.print_exc()
        return jsonify({"error": "Error interno al obtener las ventas sin entrega"}), 500


@ventas_bp.route('/con_entrega', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['CONTABLE'], ROLES['VENTAS_PEDIDOS'], )
def obtener_ventas_con_entrega(current_user):
    """
    [CORREGIDO] Obtiene TODAS las ventas que tienen un cliente asociado (consideradas "Pedidos").
    """
    try:
        query = Venta.query.options(
            selectinload(Venta.usuario_interno),
            selectinload(Venta.cliente)
        )
        
        # --- NUEVO FILTRO SIMPLIFICADO ---
        # Si tiene un cliente_id, es un pedido.
        query = query.filter(Venta.cliente_id.isnot(None))

        # --- Lógica de filtrado por fecha ---
        fecha_desde_str = request.args.get('fecha_desde')
        if fecha_desde_str:
            try:
                fecha_desde = date.fromisoformat(fecha_desde_str)
                query = query.filter(func.date(Venta.fecha_pedido) >= fecha_desde)
            except ValueError:
                return jsonify({"error": "Formato 'fecha_desde' inválido (YYYY-MM-DD)"}), 400

        fecha_hasta_str = request.args.get('fecha_hasta')
        if fecha_hasta_str:
            try:
                fecha_hasta = date.fromisoformat(fecha_hasta_str)
                query = query.filter(func.date(Venta.fecha_pedido) <= fecha_hasta)
            except ValueError:
                return jsonify({"error": "Formato 'fecha_hasta' inválido (YYYY-MM-DD)"}), 400

        query = query.order_by(Venta.fecha_registro.desc())
        
        # --- Paginación y Serialización ---
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 2000, type=int) # Límite alto por defecto
        
        paginated_ventas = query.paginate(page=page, per_page=per_page, error_out=False)
        ventas_db = paginated_ventas.items
        ventas_list = [venta_a_dict_resumen(v) for v in ventas_db]

        # Guardar los argumentos de la consulta en un archivo JSON para debugging
        import json
        try:
            with open('/root/quimex_2.0/sistema_quimicos/ventas_con_entrega_debug.json', 'w') as f:
                json.dump(dict(request.args), f, indent=2, ensure_ascii=False)
        except Exception as e:
            pass

        return jsonify({
            "ventas": ventas_list,
            # --- SECCIÓN DE PAGINACIÓN COMPLETA ---
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
        traceback.print_exc()
        return jsonify({"error": "Error interno al obtener las ventas con entrega"}), 500


# --- Endpoint: Eliminar Venta (Sin cambios) ---
@ventas_bp.route('/eliminar/<int:venta_id>', methods=['DELETE'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['VENTAS_PEDIDOS'])
def eliminar_venta(current_user, venta_id):
    """Elimina una venta y sus detalles."""
    venta_db = db.session.get(Venta, venta_id)
    if not venta_db: return jsonify({"error": "Venta no encontrada"}), 404
    try:
        # Añadir lógica de negocio aquí si es necesario (ej: no borrar facturada)
        db.session.delete(venta_db) # Cascade debería borrar detalles si está configurado en el modelo
        db.session.commit()
        print(f"INFO: Venta eliminada: ID {venta_id}")
        return jsonify({"message": f"Venta ID {venta_id} eliminada"}), 200
    except Exception as e: db.session.rollback(); print(f"ERROR [eliminar_venta]: Venta {venta_id} - {e}"); traceback.print_exc(); return jsonify({"error":"ISE"}),500

# --- Endpoint para Generar Comprobante HTML (Sin cambios) ---
@ventas_bp.route('/obtener_comprobante/<int:venta_id>', methods=['GET'])
def obtener_comprobante_venta(venta_id):
    """Genera y devuelve un HTML formateado como comprobante no fiscal."""
    try:
        venta_db = db.session.query(Venta).options(
            selectinload(Venta.detalles).selectinload(DetalleVenta.producto),
            selectinload(Venta.usuario_interno), selectinload(Venta.cliente) # Eager load cliente
        ).get(venta_id)
        if not venta_db: return "<h1>Venta no encontrada</h1>", 404
        venta_dict = venta_a_dict_completo(venta_db) # Usar serializador completo
        context = {"venta": venta_dict, "RECARGO_TRANSFERENCIA_PORC": RECARGO_TRANSFERENCIA_PORC, "RECARGO_FACTURA_PORC": RECARGO_FACTURA_PORC}
        html_comprobante = render_template('comprobante_venta.html', **context) # Asegúrate que la plantilla exista
        response = make_response(html_comprobante)
        response.headers['Content-Type'] = 'text/html'
        return response
    except Exception as e: print(f"ERROR [obtener_comprobante_venta]: Venta {venta_id} - {e}"); traceback.print_exc(); return f"<h1>Error interno</h1><p>{e}</p>", 500


# --- Funciones Auxiliares para Serializar Venta/Detalle (Actualizadas) ---

def venta_a_dict_resumen(venta):
    if not venta: return None
    
    # --- Lógica para parsear el estado y el vendedor ---
    estado = 'Pendiente' # Valor por defecto
    vendedor_real = venta.nombre_vendedor
    if venta.nombre_vendedor:
        partes = venta.nombre_vendedor.split('-', 1)
        # Lista de estados válidos en mayúsculas
        estados_posibles = ['PENDIENTE', 'LISTO PARA ENTREGAR', 'ENTREGADO', 'CANCELADO']
        if len(partes) > 1 and partes[0].upper().replace(' ', '_') in [s.replace(' ', '_') for s in estados_posibles]:
            # Convierte "LISTO PARA ENTREGAR" a "Listo para Entregar"
            estado = partes[0].replace('_', ' ').title()
            vendedor_real = partes[1]

    return {
        "venta_id": venta.id,
        "estado": estado,  # <-- CAMPO NUEVO PARA EL FRONTEND
        "nombre_vendedor": vendedor_real, # <-- Vendedor limpio
        "fecha_registro": venta.fecha_registro.isoformat() if venta.fecha_registro else None,
        "fecha_pedido": venta.fecha_pedido.isoformat() if venta.fecha_pedido else None,
        "direccion_entrega": venta.direccion_entrega,
        "usuario_interno_id": venta.usuario_interno_id,
        "usuario_nombre": venta.usuario_interno.nombre if venta.usuario_interno else None,
        "cliente_id": venta.cliente_id,
        "cliente_nombre": venta.cliente.nombre_razon_social if venta.cliente else None,
        "cliente_zona": venta.cliente.localidad if venta.cliente else None, # <-- AÑADIDO PARA EL REMITO
        "cuit_cliente": venta.cuit_cliente,
        "monto_total_base": float(venta.monto_total) if venta.monto_total is not None else None,
        "forma_pago": venta.forma_pago,
        "requiere_factura": venta.requiere_factura,
        "monto_final_con_recargos": float(venta.monto_final_con_recargos) if venta.monto_final_con_recargos is not None else None,
    }

def venta_a_dict_completo(venta):
    if not venta: return None
    resumen = venta_a_dict_resumen(venta)
    monto_final_real = float(venta.monto_final_con_recargos) if venta.monto_final_con_recargos is not None else None
    monto_total_base = float(venta.monto_total) if venta.monto_total is not None else None
    resumen.update({
        "observaciones": venta.observaciones,
        "descuento_total_global_porcentaje": float(getattr(venta, "descuento_general", 0.0) or 0.0),
        "recargos": {
            "transferencia": float(venta.recargo_transferencia or 0),
            "factura_iva": float(venta.recargo_factura or 0),
        },
        "monto_pagado_cliente": float(venta.monto_pagado_cliente) if venta.monto_pagado_cliente is not None else None,
        "vuelto_calculado": float(venta.vuelto_calculado) if venta.vuelto_calculado is not None else None,
        "detalles": [
            detalle_venta_a_dict(d, monto_final_real, monto_total_base) for d in venta.detalles
        ]
    })
    return resumen

def detalle_venta_a_dict(detalle, monto_final_real=None, monto_total_base=None):
    if not detalle:
        return None
    precio_total_item_ars = float(detalle.precio_total_item_ars or 0)
    subtotal_proporcional = None
    if monto_final_real is not None and monto_total_base and monto_total_base > 0:
        subtotal_proporcional = monto_final_real * (precio_total_item_ars / monto_total_base)
    return {
        "detalle_id": detalle.id,
        "producto_id": detalle.producto_id,
        "producto_nombre": detalle.producto.nombre if detalle.producto else "Producto no encontrado",
        "cantidad": float(detalle.cantidad),
        "descuento_item_porcentaje": float(getattr(detalle, "descuento_item", 0.0) or 0.0),
        "precio_unitario_venta_ars": float(detalle.precio_unitario_venta_ars or 0),
        "precio_total_item_ars": precio_total_item_ars,
        "subtotal_proporcional_con_recargos": subtotal_proporcional,
        "observacion_item": detalle.observacion_item,
    }
    

@ventas_bp.route('/actualizar-estado-lote', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['VENTAS_PEDIDOS']) # Define qué roles pueden hacer esto
def actualizar_estado_lote(current_user):
    """
    Actualiza el estado de múltiples ventas a la vez.
    Reutiliza el campo 'nombre_vendedor' con el formato 'ESTADO-Vendedor'.
    """
    data = request.get_json()
    if not data or 'venta_ids' not in data or 'nuevo_estado' not in data:
        return jsonify({"error": "Payload incompleto. Se requieren 'venta_ids' y 'nuevo_estado'."}), 400

    venta_ids = data['venta_ids']
    nuevo_estado_str = data['nuevo_estado']
    
    if not isinstance(venta_ids, list) or not venta_ids:
        return jsonify({"error": "'venta_ids' debe ser una lista no vacía de IDs."}), 400

    # Lista de estados válidos para asegurar la consistencia de los datos
    estados_validos = ['Pendiente', 'Listo para Entregar', 'Entregado', 'Cancelado']
    if nuevo_estado_str not in estados_validos:
        return jsonify({"error": f"El estado '{nuevo_estado_str}' no es válido. Válidos son: {', '.join(estados_validos)}"}), 400
    
    # Convertimos el estado del frontend (ej: "Listo para Entregar") a formato de BD (ej: "LISTO_PARA_ENTREGAR")
    nuevo_estado_db = nuevo_estado_str.upper().replace(' ', '_')

    try:
        # Hacemos la consulta a la base de datos para obtener todas las ventas a la vez
        ventas_a_actualizar = db.session.query(Venta).filter(Venta.id.in_(venta_ids)).all()
        
        if len(ventas_a_actualizar) != len(venta_ids):
             ids_encontrados = {v.id for v in ventas_a_actualizar}
             ids_faltantes = [vid for vid in venta_ids if vid not in ids_encontrados]
             print(f"WARN [actualizar_estado_lote]: No se encontraron algunas ventas. IDs faltantes: {ids_faltantes}")

        if not ventas_a_actualizar:
            return jsonify({"error": "No se encontraron ventas con los IDs proporcionados."}), 404

        count_actualizadas = 0
        for venta in ventas_a_actualizar:
            # Desarmamos el campo actual para obtener el vendedor original
            partes = venta.nombre_vendedor.split('-', 1)
            vendedor_original = partes[1] if len(partes) > 1 else venta.nombre_vendedor
            
            # Reconstruimos el campo con el NUEVO estado y el vendedor original
            venta.nombre_vendedor = f"{nuevo_estado_db}-{vendedor_original}"
            count_actualizadas += 1
        
        db.session.commit()
        
        return jsonify({
            "message": f"{count_actualizadas} de {len(venta_ids)} ventas solicitadas fueron actualizadas al estado '{nuevo_estado_str}'."
        }), 200

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al actualizar los estados.", "detalle": str(e)}), 500



@ventas_bp.route('/obtener-detalles-lote', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['VENTAS_PEDIDOS']) # O los roles que correspondan
def obtener_detalles_lote(current_user):
    """
    Recibe una lista de IDs de venta y devuelve los detalles completos de cada una.
    Optimizado para hacer una sola consulta a la base de datos.
    """
    data = request.get_json()
    if not data or 'venta_ids' not in data:
        return jsonify({"error": "Payload incompleto. Se requiere 'venta_ids'."}), 400

    venta_ids = data['venta_ids']
    if not isinstance(venta_ids, list):
        return jsonify({"error": "'venta_ids' debe ser una lista."}), 400

    try:
        # --- CONSULTA EFICIENTE ---
        # Hacemos una única consulta para obtener todas las ventas y sus relaciones
        ventas_db = db.session.query(Venta).options(
            selectinload(Venta.detalles).selectinload(DetalleVenta.producto),
            selectinload(Venta.cliente),
            selectinload(Venta.usuario_interno)
        ).filter(Venta.id.in_(venta_ids)).all()

        if not ventas_db:
            return jsonify({"error": "No se encontraron ventas con los IDs proporcionados."}), 404
       
        ventas_completas = [venta_a_dict_completo(v) for v in ventas_db]
        # Recalcular precios de cada ítem usando precios_utils.calculate_price
        for venta in ventas_completas:
            if 'descuento_total_global_porcentaje' in venta:
                venta['descuento_total_global_porcentaje'] = round(venta['descuento_total_global_porcentaje'])
            if 'observaciones' not in venta:
                venta['observaciones'] = ''
            monto_total_items = 0.0
            for detalle in venta.get('detalles', []):
                # Redondeo del descuento por ítem
                if 'descuento_item_porcentaje' in detalle:
                    detalle['descuento_item_porcentaje'] = round(detalle['descuento_item_porcentaje'])
                if 'observacion_item' not in detalle:
                    detalle['observacion_item'] = ''
                # Recalcular precio usando precios_utils
                calc_result = precios_utils.calculate_price(
                    product_id=detalle.get('producto_id'),
                    quantity=detalle.get('cantidad'),
                    cliente_id=venta.get('cliente_id'),
                    db=db
                )
                if calc_result.get('status') == 'success':
                    detalle['precio_total_item_ars'] = calc_result['precio_total_calculado_ars']
                else:
                    # Si hay error, dejar el precio original
                    pass
                monto_total_items += detalle.get('precio_total_item_ars', 0.0)
            # Calcular el subtotal proporcional de cada ítem usando la suma de los ítems
            for detalle in venta.get('detalles', []):
                precio = detalle.get('precio_total_item_ars', 0.0)
                if monto_total_items > 0:
                    detalle['subtotal_proporcional_con_recargos'] = precio # proporción 1:1
                else:
                    detalle['subtotal_proporcional_con_recargos'] = 0.0
            venta['monto_final_con_recargos'] = monto_total_items
        return jsonify(ventas_completas)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Error interno al obtener los detalles de las ventas.", "detalle": str(e)}), 500
    
@ventas_bp.route('/recalcular-montos-por-dolar', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['VENTAS_PEDIDOS'])
def recalcular_montos_por_dolar(current_user):
    """
    Endpoint paralelo para pruebas: recibe venta_ids y valor_dolar,
    devuelve las ventas con montos recalculados usando ese valor.
    """
    data = request.get_json()
    if not data or 'venta_ids' not in data or 'valor_dolar' not in data:
        return jsonify({"error": "Payload incompleto. Se requieren 'venta_ids' y 'valor_dolar'."}), 400

    venta_ids = data['venta_ids']
    valor_dolar = float(data['valor_dolar'])
    if not isinstance(venta_ids, list) or not venta_ids:
        return jsonify({"error": "'venta_ids' debe ser una lista no vacía de IDs."}), 400
    if valor_dolar <= 0:
        return jsonify({"error": "'valor_dolar' debe ser mayor a 0."}), 400

    try:
        ventas_db = db.session.query(Venta).options(
            selectinload(Venta.detalles).selectinload(DetalleVenta.producto),
            selectinload(Venta.cliente),
            selectinload(Venta.usuario_interno)
        ).filter(Venta.id.in_(venta_ids)).all()

        if not ventas_db:
            return jsonify({"error": "No se encontraron ventas con los IDs proporcionados."}), 404

        ventas_recalculadas = []
        for venta in ventas_db:
            monto_final_real = float(venta.monto_final_con_recargos) if venta.monto_final_con_recargos is not None else 0.0
            monto_total_base = float(venta.monto_total) if venta.monto_total is not None else 0.0
            # Recalcular montos por dólar
            monto_final_recalculado = monto_final_real * valor_dolar
            detalles_recalculados = []
            for d in venta.detalles:
                precio_total_item_ars = float(d.precio_total_item_ars or 0)
                subtotal_proporcional = None
                if monto_total_base > 0:
                    subtotal_proporcional = monto_final_recalculado * (precio_total_item_ars / monto_total_base)
                detalles_recalculados.append({
                    "detalle_id": d.id,
                    "producto_id": d.producto_id,
                    "producto_nombre": d.producto.nombre if d.producto else "Producto no encontrado",
                    "cantidad": float(d.cantidad),
                    "descuento_item_porcentaje": float(getattr(d, "descuento_item", 0.0) or 0.0),
                    "precio_unitario_venta_ars": float(d.precio_unitario_venta_ars or 0) * valor_dolar,
                    "precio_total_item_ars": precio_total_item_ars * valor_dolar,
                    "subtotal_proporcional_con_recargos": subtotal_proporcional,
                    "observacion_item": d.observacion_item,
                })
            venta_dict = venta_a_dict_resumen(venta)
            venta_dict.update({
                "monto_final_con_recargos": monto_final_recalculado,
                "detalles": detalles_recalculados,
                "valor_dolar_usado": valor_dolar,
            })
            ventas_recalculadas.append(venta_dict)

        return jsonify(ventas_recalculadas)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Error interno al recalcular los montos.", "detalle": str(e)}), 500
    
    
@ventas_bp.route('/actualizar_precios_pendientes', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['VENTAS_PEDIDOS'])
def actualizar_precios_pendientes(current_user):
    """
    Recalcula y actualiza los precios de todas las boletas pendientes (estado 'Pendiente').
    Permite filtrar por cliente si se envía 'cliente_id'.
    """
    data = request.get_json() or {}
    cliente_id = data.get('cliente_id')
    # Filtrar ventas pendientes por el formato en nombre_vendedor (ej: 'PENDIENTE-...')
    from sqlalchemy import or_
    query = Venta.query.filter(
        or_(
            Venta.nombre_vendedor.ilike('PENDIENTE-%'),
            Venta.nombre_vendedor.ilike('pedidos')
        )
    )
    if cliente_id:
        query = query.filter_by(cliente_id=cliente_id)
    ventas_pendientes = query.all()
    logs = []
    actualizadas = []
    logs.append(f"Total boletas pendientes encontradas: {len(ventas_pendientes)}")
    if len(ventas_pendientes) == 0:
        # Mostrar los primeros 10 y los últimos 10 nombre_vendedor de todas las ventas para depuración
        primeras_ventas = Venta.query.order_by(Venta.id.asc()).limit(10).all()
        ultimas_ventas = Venta.query.order_by(Venta.id.desc()).limit(10).all()
        logs.append("Primeros 10 nombre_vendedor en la base de datos:")
        for v in primeras_ventas:
            logs.append(f"ID: {v.id}, nombre_vendedor: {v.nombre_vendedor}")
        logs.append("Últimos 10 nombre_vendedor en la base de datos:")
        for v in ultimas_ventas:
            logs.append(f"ID: {v.id}, nombre_vendedor: {v.nombre_vendedor}")
    else:
        logs.append("Boletas pendientes encontradas:")
        for v in ventas_pendientes:
            logs.append(f"ID: {v.id}, nombre_vendedor: {v.nombre_vendedor}")
    for venta in ventas_pendientes:
        db.session.expire_all()  # Fuerza recarga de datos desde la base de datos, incluido el tipo de cambio
        if not venta.detalles or len(venta.detalles) == 0:
            logs.append(f"Venta ID {venta.id}: NO se recalcula porque no tiene ítems. Se mantiene sin cambios.")
            continue
        monto_total_base_nuevo = Decimal('0.00')
        detalles_nuevos = []
        tc_usados = []
        from ..models import DetalleVenta, Producto, TipoCambio
        DetalleVenta.query.filter_by(venta_id=venta.id).delete()
        db.session.flush()
        for d in venta.detalles:
            # Recalcular usando la función completa
            precio_u_bruto, precio_t_bruto, costo_u, _, error_msg, es_precio_especial = calcular_precio_item_venta(
                d.producto_id, Decimal(str(d.cantidad)), venta.cliente_id
            )
            if error_msg:
                logs.append(f"Venta ID {venta.id} - Producto {d.producto_id}: ERROR: {error_msg}")
                continue
            # Obtener tipo de cambio usado
            producto = db.session.get(Producto, d.producto_id)
            tc_nombre = 'Oficial' if getattr(producto, 'ajusta_por_tc', False) else 'Empresa'
            tipo_cambio = TipoCambio.query.filter_by(nombre=tc_nombre).first()
            tc_valor = tipo_cambio.valor if tipo_cambio else None
            tc_usados.append(f"Prod {d.producto_id}: TC '{tc_nombre}'={tc_valor}")
            precio_t_neto_item = precio_t_bruto * (Decimal(1) - (Decimal(str(d.descuento_item or 0)) / Decimal(100)))
            detalle_nuevo = DetalleVenta(
                venta_id=venta.id,
                producto_id=d.producto_id,
                cantidad=d.cantidad,
                precio_unitario_venta_ars=precio_u_bruto,
                precio_total_item_ars=precio_t_neto_item,
                costo_unitario_momento_ars=costo_u,
                descuento_item=d.descuento_item,
                observacion_item=d.observacion_item
            )
            db.session.add(detalle_nuevo)
            monto_total_base_nuevo += precio_t_neto_item
            detalles_nuevos.append(detalle_nuevo)
        venta.monto_total = monto_total_base_nuevo.quantize(Decimal('0.01'))
        monto_con_recargos_nuevo, recargo_t_nuevo, recargo_f_nuevo, _, _ = calcular_monto_final_y_vuelto(
            venta.monto_total, venta.forma_pago, venta.requiere_factura
        )
        descuento_total_nuevo_porc = Decimal(str(getattr(venta, 'descuento_general', '0.0')))
        monto_final_a_pagar_nuevo = monto_con_recargos_nuevo * (Decimal(1) - descuento_total_nuevo_porc / Decimal(100))
        monto_final_a_pagar_nuevo = Decimal(math.ceil(monto_final_a_pagar_nuevo / 100) * 100)
        monto_final_anterior = float(venta.monto_final_con_recargos) if venta.monto_final_con_recargos is not None else None
        logs.append(f"Venta ID {venta.id}: TC usados: {', '.join(tc_usados)}")
        logs.append(f"Venta ID {venta.id}: monto_final_con_recargos anterior = {monto_final_anterior}, nuevo = {float(monto_final_a_pagar_nuevo)}")
        venta.recargo_transferencia = recargo_t_nuevo
        venta.recargo_factura = recargo_f_nuevo
        venta.monto_final_con_recargos = monto_final_a_pagar_nuevo
        venta.monto_final_redondeado = monto_final_a_pagar_nuevo
        actualizadas.append(venta.id)
    db.session.flush()
    db.session.commit()
    db.session.expire_all()  # Fuerza que los datos estén actualizados en futuras consultas

    # Consultar nuevamente las ventas actualizadas y recargar detalles antes de serializar
    ventas_actualizadas_objs = db.session.query(Venta).filter(Venta.id.in_(actualizadas)).all()
    ventas_actualizadas_data = []
    for v in ventas_actualizadas_objs:
        db.session.refresh(v)
        v.detalles = db.session.query(DetalleVenta).filter_by(venta_id=v.id).all()
        ventas_actualizadas_data.append(venta_a_dict_completo(v))

    return jsonify({
        "status": "success",
        "message": f"Precios actualizados en {len(actualizadas)} boletas pendientes.",
        "ventas_actualizadas": actualizadas,
        "ventas_actualizadas_data": ventas_actualizadas_data,
        "logs": logs
    })