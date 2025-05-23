# app/blueprints/ventas.py

from flask import Blueprint, request, jsonify, render_template, make_response
from sqlalchemy.orm import selectinload # Para Eager Loading
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import traceback
import datetime

# --- Imports locales ---
from .. import db
from ..models import ( Venta, DetalleVenta, Producto, UsuarioInterno, Cliente, # Añadido Cliente
                      TipoCambio, PrecioEspecialCliente ) # Añadido PrecioEspecialCliente
# Ajusta la ruta si es necesario para estas funciones auxiliares
# Asumiendo que están en productos.py dentro de blueprints, o muévelas a utils si prefieres
try:
    from .productos import calcular_costo_producto_referencia, obtener_coeficiente_por_rango
except ImportError:
    print("ERROR [ventas.py]: No se pudieron importar funciones desde .productos. Verifica la ubicación.")
    # Definir funciones dummy para que la app no falle al cargar, pero dará error al usar
    def calcular_costo_producto_referencia(pid): print("ERROR: calcular_costo_producto_referencia no importada!"); return None
    def obtener_coeficiente_por_rango(r, q, t): print("ERROR: obtener_coeficiente_por_rango no importada!"); return None

# Importar decoradores/roles (descomenta si los usas)
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES

# --- Blueprint ---
ventas_bp = Blueprint('ventas', __name__, url_prefix='/ventas')

# --- Constantes de Recargo ---
RECARGO_TRANSFERENCIA_PORC = Decimal("10.5") # 10.5%
RECARGO_FACTURA_PORC = Decimal("21.0") # 21.0% (IVA)

# --- Función Auxiliar para calcular precio item VENTA (MODIFICADA con Precio Especial) ---
def calcular_precio_item_venta(producto_id, cantidad_decimal, cliente_id=None):
    """
    Calcula el precio unitario y total para un item de venta.
    Primero busca un precio especial ACTIVO para el cliente/producto.
    Si no existe o no aplica, calcula dinámicamente.
    Devuelve: (precio_unitario_ars, precio_total_ars, costo_momento_ars, coeficiente, error_msg, es_precio_especial)
    """
    print(f"DEBUG [calcular_precio_item_venta]: Calculando para ProdID={producto_id}, Cant={cantidad_decimal}, ClienteID={cliente_id}")
    try:
        producto = db.session.get(Producto, producto_id)
        if not producto:
            return None, None, None, None, f"Producto ID {producto_id} no encontrado.", False

        # --- Búsqueda de Precio Especial ---
        if cliente_id:
            print(f"DEBUG [calcular_precio_item_venta]: Buscando precio especial para ClienteID={cliente_id}, ProdID={producto_id}")
            precio_especial_activo = db.session.query(PrecioEspecialCliente).filter(
                PrecioEspecialCliente.cliente_id == cliente_id,
                PrecioEspecialCliente.producto_id == producto_id,
                PrecioEspecialCliente.activo == True # Solo considerar precios activos
            ).first()

            if precio_especial_activo:
                precio_unitario_fijo = precio_especial_activo.precio_unitario_fijo_ars
                if precio_unitario_fijo is not None:
                    precio_total_fijo = (precio_unitario_fijo * cantidad_decimal).quantize(Decimal("0.01"), ROUND_HALF_UP)
                    print(f"DEBUG [calcular_precio_item_venta]: ¡Encontrado! Usando precio especial fijo ARS {precio_unitario_fijo:.4f}")

                    # Calcular costo base para reporting (incluso con precio especial)
                    costo_ref_usd_calc = calcular_costo_producto_referencia(producto_id)
                    costo_momento_ars_calc = None

                    if costo_ref_usd_calc is not None:
                        nombre_tc_aplicar = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
                        tipo_cambio = TipoCambio.query.filter_by(nombre=nombre_tc_aplicar).first()
                        if tipo_cambio and tipo_cambio.valor and tipo_cambio.valor > 0:
                            costo_momento_ars_calc = (costo_ref_usd_calc * tipo_cambio.valor).quantize(Decimal("0.0001"))
                        else:
                            print(f"WARN [calcular_precio_item_venta]: TC '{nombre_tc_aplicar}' inválido al calcular costo (precio especial).")
                    else:
                        print(f"WARN [calcular_precio_item_venta]: No se pudo obtener costo base (precio especial).")

                    return precio_unitario_fijo, precio_total_fijo, costo_momento_ars_calc, None, None, True # Flag True
                else:
                    print(f"WARN [calcular_precio_item_venta]: Precio especial encontrado pero el valor es NULL.")
            else:
                 print(f"DEBUG [calcular_precio_item_venta]: No se encontró precio especial activo para esta combinación.")

        # --- Cálculo Dinámico Normal ---
        print(f"DEBUG [calcular_precio_item_venta]: Procediendo con cálculo dinámico para producto {producto_id}.")
        costo_ref_usd = calcular_costo_producto_referencia(producto_id)
        if costo_ref_usd is None:
             raise ValueError(f"No se pudo calcular el costo base USD para producto ID {producto_id}.")

        nombre_tc_aplicar = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
        tipo_cambio = TipoCambio.query.filter_by(nombre=nombre_tc_aplicar).first()
        if not tipo_cambio or tipo_cambio.valor is None or tipo_cambio.valor <= 0:
            raise ValueError(f"Tipo de cambio '{nombre_tc_aplicar}' no válido o no encontrado.")

        costo_momento_ars = (costo_ref_usd * tipo_cambio.valor).quantize(Decimal("0.0001"))

        margen = Decimal(producto.margen) if producto.margen is not None else Decimal(0)
        tipo_calculo = producto.tipo_calculo
        ref_calculo_str = str(producto.ref_calculo) if producto.ref_calculo is not None else None
        if margen < 0 or margen >= 1: raise ValueError(f"Margen inválido ({margen}) para producto ID {producto_id}.")
        if not tipo_calculo or ref_calculo_str is None:
            raise ValueError(f"Faltan tipo_calculo o ref_calculo en producto ID {producto_id}.")

        cantidad_str = str(cantidad_decimal)
        # Asegurarse que la función obtener_coeficiente exista y funcione
        coeficiente = obtener_coeficiente_por_rango(ref_calculo_str, cantidad_str, tipo_calculo)
        if coeficiente is None:
            # Intentar dar un mensaje más útil si es posible
            print(f"WARN [calcular_precio_item_venta]: Coeficiente no encontrado para Ref={ref_calculo_str}, Qty={cantidad_str}, Tipo={tipo_calculo}. Revisa datos en 'calculator' o matrices.")
            raise ValueError(f"No se encontró coeficiente aplicable para la cantidad solicitada.")
        try:
             coeficiente_decimal = Decimal(str(coeficiente))
        except InvalidOperation:
             raise ValueError(f"Coeficiente obtenido ('{coeficiente}') no es un número válido.")

        denominador = Decimal(1) - margen
        if denominador == 0: raise ValueError("Margen no puede ser 1 (división por cero).")
        precio_unitario_ars = (costo_momento_ars / denominador * coeficiente_decimal).quantize(Decimal("0.0001"))
        precio_total_ars = (precio_unitario_ars * cantidad_decimal).quantize(Decimal("0.01"), ROUND_HALF_UP)
        print(f"DEBUG [calcular_precio_item_venta]: Cálculo dinámico: PU={precio_unitario_ars:.4f}, PT={precio_total_ars:.2f}, Costo={costo_momento_ars:.4f}, Coef={coeficiente_decimal}")

        return precio_unitario_ars, precio_total_ars, costo_momento_ars, coeficiente_decimal, None, False # Flag False

    except ValueError as e:
        print(f"WARN [calcular_precio_item_venta]: Error VALOR calculando precio para producto {producto_id}: {e}")
        # Devolver el mensaje de error específico de ValueError
        return None, None, None, None, str(e), False
    except ImportError as e:
         print(f"ERROR FATAL [calcular_precio_item_venta]: Error de importación al intentar calcular precio: {e}")
         traceback.print_exc()
         return None, None, None, None, "Error de configuración interna (importación).", False
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
                faltante = (monto_final - monto_pagado_decimal).quantize(Decimal("0.01"), ROUND_HALF_UP)
                error = f"Pago insuficiente. Monto pagado: {monto_pagado_decimal:.2f}, Total final: {monto_final:.2f}, Faltan: {faltante:.2f}"
                print(f"WARN [calc_final]: {error}")
                return monto_final, recargo_t, recargo_f, None, error
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
@token_required # Descomenta si lo necesitas
@roles_required(ROLES['VENTAS_LOCAL'],ROLES['VENTAS_PEDIDOS'],ROLES['ADMIN']) # O el rol apropiado
def registrar_venta(current_user):
    """Registra una nueva venta, considerando precios especiales."""
    data = request.get_json()
    if not data: return jsonify({"error": "Payload JSON vacío"}), 400

    # --- Validación de cabecera ---
    usuario_interno_id = data.get('usuario_interno_id')
    cliente_id = data.get('cliente_id') # Obtener ID del cliente (puede ser None)
    nombre_vendedor = data.get('nombre_vendedor')
    items_payload = data.get('items')

    # Validaciones robustas
    if not usuario_interno_id or not isinstance(usuario_interno_id, int):
        return jsonify({"error": "Falta o es inválido 'usuario_interno_id' (entero requerido)"}), 400
    if not items_payload or not isinstance(items_payload, list) or not items_payload:
        return jsonify({"error": "Falta o está vacía la lista 'items'"}), 400
    if cliente_id is not None and not isinstance(cliente_id, int):
         return jsonify({"error": "cliente_id debe ser un entero o nulo"}), 400

    # Verificar existencia de usuario y cliente (si se proporciona)
    usuario = db.session.get(UsuarioInterno, usuario_interno_id)
    if not usuario: return jsonify({"error": f"Usuario interno ID {usuario_interno_id} no encontrado"}), 404
    if cliente_id:
        cliente = db.session.get(Cliente, cliente_id)
        if not cliente: return jsonify({"error": f"Cliente ID {cliente_id} no encontrado"}), 404

    # --- Opcionales para recargo/vuelto ---
    forma_pago = data.get('forma_pago') # String
    requiere_factura = data.get('requiere_factura', False) # Boolean
    monto_pagado_str = data.get('monto_pagado_cliente') # String o None

    detalles_venta_db = []
    monto_total_base_calc = Decimal("0.00")
    commit_necesario = False # Flag para saber si realmente necesitamos hacer commit

    try:
        # --- 1. Procesar Items y Calcular Monto Base ---
        print(f"DEBUG [registrar_venta]: Procesando {len(items_payload)} items...")
        for idx, item_data in enumerate(items_payload):
            producto_id = item_data.get("producto_id")
            cantidad_str = str(item_data.get("cantidad", "")).strip().replace(',', '.')

            if not producto_id or not isinstance(producto_id, int):
                 return jsonify({"error": f"Item #{idx+1}: falta/inválido 'producto_id' (entero requerido)"}), 400
            try:
                cantidad = Decimal(cantidad_str)
                if cantidad <= 0: raise ValueError("Cantidad debe ser positiva")
            except (InvalidOperation, ValueError):
                 return jsonify({"error": f"Item #{idx+1}: cantidad inválida ('{item_data.get('cantidad')}')"}), 400

            # Calcular precio, pasando el cliente_id
            precio_u, precio_t, costo_u, coef, error_msg, fue_especial = calcular_precio_item_venta(
                producto_id,
                cantidad,
                cliente_id # Pasar el ID del cliente (o None si no se proporcionó)
            )
            # Si hubo error en el cálculo del precio de un item, detener y devolver error
            if error_msg:
                 print(f"ERROR [registrar_venta]: Fallo al calcular precio para item {idx+1} (ProdID:{producto_id}): {error_msg}")
                 return jsonify({"error": f"Error en Item #{idx+1} (Producto ID:{producto_id}): {error_msg}"}), 400

            producto_db = db.session.get(Producto, producto_id) # Ya sabemos que existe

            # Crear DetalleVenta
            detalle = DetalleVenta(
                producto_id=producto_id,
                cantidad=cantidad,
                # Guardar margen/coeficiente APLICADOS (pueden ser None si fue precio especial)
                margen_aplicado=producto_db.margen if not fue_especial and producto_db.margen is not None else None,
                coeficiente_usado=coef if not fue_especial and coef is not None else None,
                costo_unitario_momento_ars=costo_u, # Siempre guardar costo si se pudo calcular
                precio_unitario_venta_ars=precio_u,
                precio_total_item_ars=precio_t
                # Opcional: añadir campo 'es_precio_especial' al modelo DetalleVenta
                # es_precio_especial=fue_especial
            )
            detalles_venta_db.append(detalle)
            monto_total_base_calc += precio_t

        monto_total_base_calc = monto_total_base_calc.quantize(Decimal("0.01"), ROUND_HALF_UP)
        print(f"DEBUG [registrar_venta]: Monto total base calculado: {monto_total_base_calc}")

        # --- 2. Calcular Recargos, Monto Final y Vuelto ---
        monto_final_calc, recargo_t_calc, recargo_f_calc, vuelto_calc, error_calculo_final = calcular_monto_final_y_vuelto(
            monto_total_base_calc, forma_pago, requiere_factura, monto_pagado_str
        )
        # Si hubo error en cálculo final (ej: pago insuficiente o inválido), detener y devolver error
        if error_calculo_final:
             print(f"ERROR [registrar_venta]: Error en cálculo final: {error_calculo_final}")
             # Devolver error 400 Bad Request
             return jsonify({"error": error_calculo_final,
                             "monto_total_base": float(monto_total_base_calc),
                             "monto_final_requerido": float(monto_final_calc)}), 400

        print(f"DEBUG [registrar_venta]: Monto final: {monto_final_calc}, Rec T: {recargo_t_calc}, Rec F: {recargo_f_calc}, Vuelto: {vuelto_calc}")

        # --- 3. Crear y Guardar Venta en DB ---
        fecha_pedido_dt = None
        if data.get('fecha_pedido'):
            try: fecha_pedido_dt = datetime.datetime.fromisoformat(data['fecha_pedido'])
            except ValueError: print(f"WARN [registrar_venta]: Formato fecha_pedido inválido: {data['fecha_pedido']}")

        # Crear instancia de Venta
        nueva_venta = Venta(
            usuario_interno_id=usuario_interno_id,
            cliente_id=cliente_id, # Guardar cliente_id (puede ser None)
            fecha_pedido=fecha_pedido_dt,
            direccion_entrega=data.get('direccion_entrega'),
            cuit_cliente=data.get('cuit_cliente'),
            observaciones=data.get('observaciones'),
            nombre_vendedor=nombre_vendedor,
            monto_total=monto_total_base_calc, # Guardar monto base
            # Guardar datos de recargos y vuelto
            forma_pago=forma_pago,
            requiere_factura=requiere_factura,
            recargo_transferencia=recargo_t_calc if recargo_t_calc > 0 else None,
            recargo_factura=recargo_f_calc if recargo_f_calc > 0 else None,
            monto_final_con_recargos=monto_final_calc,
            # Guardar monto pagado como Decimal, redondeado
            monto_pagado_cliente=Decimal(monto_pagado_str).quantize(Decimal("0.01")) if monto_pagado_str is not None else None,
            vuelto_calculado=vuelto_calc
        )
        # Asociar detalles ANTES de añadir a la sesión
        nueva_venta.detalles = detalles_venta_db

        db.session.add(nueva_venta)
        commit_necesario = True # Marcar que necesitamos commit
        db.session.commit() # Intentar guardar todo

        print(f"INFO [registrar_venta]: Venta registrada exitosamente: ID {nueva_venta.id}, Monto Final: {monto_final_calc}, Vuelto: {vuelto_calc}")

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
            # Considera devolver la venta completa si el frontend la necesita ya
            # "venta_completa": venta_a_dict_completo(nueva_venta)
        }
        return jsonify(respuesta), 201

    except (InvalidOperation, ValueError) as e: # Captura errores de conversión Decimal o validación
         if commit_necesario: db.session.rollback() # Rollback si algo falló después de añadir
         print(f"ERROR [registrar_venta]: Datos inválidos - {e}")
         traceback.print_exc() # Útil para debuggear qué falló exactamente
         return jsonify({"error": f"Datos inválidos: {e}"}), 400
    except Exception as e:
        if commit_necesario: db.session.rollback() # Rollback general
        print(f"ERROR [registrar_venta]: Excepción inesperada al registrar venta: {type(e).__name__}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al registrar la venta"}), 500


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
        if error_msg: return jsonify({"error": error_msg}), 400
        respuesta = {
            "monto_base": float(Decimal(monto_base_str).quantize(Decimal("0.01"))),
            "forma_pago_aplicada": forma_pago,
            "requiere_factura_aplicada": requiere_factura,
            "recargos": { "transferencia": float(recargo_t), "factura_iva": float(recargo_f) },
            "monto_final_con_recargos": float(monto_final)
        }
        return jsonify(respuesta)
    except (InvalidOperation, TypeError, ValueError): return jsonify({"error": "Monto base inválido"}), 400
    except Exception as e: print(f"ERROR [calcular_total_venta]: Excepción {e}"); traceback.print_exc(); return jsonify({"error":"ISE"}),500

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
@token_required # Descomenta si lo necesitas
@roles_required(ROLES['ADMIN'], ROLES['CONTABLE'], ROLES['VENTAS_PEDIDOS'], ROLES['VENTAS_LOCAL']) # O los roles apropiados
def obtener_ventas(current_user):
    """Obtiene una lista de ventas, con filtros opcionales y paginación."""
    try:
        query = Venta.query  # Sin .options()

        # --- Aplicar Filtros ---
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

        # Ordenar
        query = query.order_by(Venta.fecha_registro.desc())

        # Paginación
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        paginated_ventas = query.paginate(page=page, per_page=per_page, error_out=False)
        ventas_db = paginated_ventas.items

        # Serializar Resultados
        ventas_list = []
        for venta in ventas_db:
            _ = venta.usuario_interno  # Acceso explícito para asegurar que se cargue si es perezoso
            _ = venta.cliente  # Para forzar carga si es lazy
            ventas_list.append(venta_a_dict_resumen(venta))

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
# def obtener_ventas(current_user):
#     """Obtiene una lista de ventas, con filtros opcionales y paginación."""
#     try:
#         query = Venta.query.options(
#             selectinload(Venta.usuario_interno),
#             selectinload(Venta.cliente) # Cargar datos del cliente para resumen
#         )

#         # Filtros (sin cambios)
#         usuario_id_filtro = request.args.get('usuario_id', type=int)
#         if usuario_id_filtro: query = query.filter(Venta.usuario_interno_id == usuario_id_filtro)
#         cliente_id_filtro = request.args.get('cliente_id', type=int)
#         if cliente_id_filtro: query = query.filter(Venta.cliente_id == cliente_id_filtro)
#         fecha_desde_str = request.args.get('fecha_desde')
#         if fecha_desde_str:
#             try: fecha_desde = datetime.date.fromisoformat(fecha_desde_str); query = query.filter(Venta.fecha_registro >= datetime.datetime.combine(fecha_desde, datetime.time.min))
#             except ValueError: return jsonify({"error": "Formato 'fecha_desde' inválido (YYYY-MM-DD)"}), 400
#         fecha_hasta_str = request.args.get('fecha_hasta')
#         if fecha_hasta_str:
#              try: fecha_hasta = datetime.date.fromisoformat(fecha_hasta_str); query = query.filter(Venta.fecha_registro < datetime.datetime.combine(fecha_hasta + datetime.timedelta(days=1), datetime.time.min))
#              except ValueError: return jsonify({"error": "Formato 'fecha_hasta' inválido (YYYY-MM-DD)"}), 400

#         # Ordenar
#         query = query.order_by(Venta.fecha_registro.desc())

#         # Paginación
#         page = request.args.get('page', 1, type=int)
#         per_page = request.args.get('per_page', 20, type=int)
#         paginated_ventas = query.paginate(page=page, per_page=per_page, error_out=False)
#         ventas_db = paginated_ventas.items

#         # Serializar Resultados (usando el resumen que incluye cliente)
#         ventas_list = [venta_a_dict_resumen(v) for v in ventas_db]

#         return jsonify({
#             "ventas": ventas_list,
#             "pagination": { "total_items": paginated_ventas.total, "total_pages": paginated_ventas.pages, "current_page": page, "per_page": per_page, "has_next": paginated_ventas.has_next, "has_prev": paginated_ventas.has_prev }
#         })
#     except Exception as e: print(f"ERROR [obtener_ventas]: {e}"); traceback.print_exc(); return jsonify({"error":"ISE"}),500

# --- Endpoint: Obtener Venta Específica (Añadido cliente a eager load) ---
@ventas_bp.route('/obtener/<int:venta_id>', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['VENTAS_PEDIDOS'], ROLES['VENTAS_LOCAL']) # O los roles apropiados
def obtener_venta_por_id(current_user, venta_id):
    """Obtiene los detalles completos de una venta específica."""
    try:
        # Cargar la venta sin eager loading (usamos .get() para obtenerla por ID)
        venta_db = db.session.query(Venta).get(venta_id)

        if not venta_db:
            return jsonify({"error": "Venta no encontrada"}), 404

        # Cargar los detalles de la venta dinámicamente (esto evita el eager loading)
        detalles = venta_db.detalles.all()

        # Cargar productos relacionados manualmente para evitar N+1
        producto_ids = [d.producto_id for d in detalles if d.producto_id]
        productos = Producto.query.filter(Producto.id.in_(producto_ids)).all()
        productos_dict = {p.id: p for p in productos}

        # Asignar manualmente los productos a cada detalle
        for detalle in detalles:
            detalle.producto = productos_dict.get(detalle.producto_id)

        # Asegurarse de que el usuario interno se cargue si es perezoso
        _ = venta_db.usuario_interno

        # Devolver la venta con su serialización completa
        return jsonify(venta_a_dict_completo(venta_db))

    except Exception as e:
        print(f"ERROR [obtener_venta_por_id]: Excepción inesperada para venta {venta_id}")
        traceback.print_exc()
        return jsonify({"error": "Error interno al obtener la venta"}), 500

# --- Endpoint: Actualizar Venta (Campos básicos) (Sin cambios lógicos aquí) ---
@ventas_bp.route('/actualizar/<int:venta_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['VENTAS_PEDIDOS'], ROLES['VENTAS_LOCAL']) # O los roles apropiados
def actualizar_venta(current_user, venta_id):
    """Actualiza campos básicos de una venta (NO recalcula precios de items)."""
    venta_db = db.session.get(Venta, venta_id)
    if not venta_db: return jsonify({"error": "Venta no encontrada"}), 404
    data = request.get_json()
    if not data: return jsonify({"error": "Payload vacío"}), 400
    try:
        campos_actualizables = ['cliente_id', 'fecha_pedido', 'direccion_entrega', 'cuit_cliente', 'observaciones', 'forma_pago', 'requiere_factura', 'monto_pagado_cliente']
        updated = False
        for campo in campos_actualizables:
            if campo in data:
                valor_nuevo = data[campo]
                # Validaciones específicas
                if campo == 'fecha_pedido' and valor_nuevo:
                     try: valor_nuevo = datetime.datetime.fromisoformat(valor_nuevo)
                     except ValueError: return jsonify({"error": f"Formato inválido para '{campo}' (ISO 8601)"}), 400
                elif campo == 'cliente_id' and valor_nuevo:
                     if not db.session.get(Cliente, valor_nuevo): return jsonify({"error": f"Cliente ID {valor_nuevo} no existe"}), 404
                elif campo == 'monto_pagado_cliente' and valor_nuevo is not None:
                    try: valor_nuevo = Decimal(str(valor_nuevo)).quantize(Decimal("0.01"))
                    except InvalidOperation: return jsonify({"error": f"Valor inválido para '{campo}'"}), 400

                # Comparar antes de asignar para saber si hubo cambios
                if getattr(venta_db, campo) != valor_nuevo:
                    setattr(venta_db, campo, valor_nuevo)
                    updated = True

        # Recalcular vuelto si monto pagado cambió
        if 'monto_pagado_cliente' in data and venta_db.monto_final_con_recargos is not None:
             # Usar el nuevo valor de monto_pagado que ya está validado y asignado (si cambió)
             nuevo_monto_pagado_str = str(venta_db.monto_pagado_cliente) if venta_db.monto_pagado_cliente is not None else None
             _, _, _, vuelto_recalc, error_vuelto = calcular_monto_final_y_vuelto(
                 venta_db.monto_final_con_recargos,
                 venta_db.forma_pago,
                 venta_db.requiere_factura,
                 nuevo_monto_pagado_str
             )
             if error_vuelto:
                 print(f"WARN [actualizar_venta]: No se pudo recalcular vuelto: {error_vuelto}")
                 if venta_db.vuelto_calculado is not None: # Solo marcar update si cambia a None
                     venta_db.vuelto_calculado = None
                     updated = True
             elif venta_db.vuelto_calculado != vuelto_recalc:
                 venta_db.vuelto_calculado = vuelto_recalc
                 updated = True

        if updated:
            db.session.commit()
            print(f"INFO: Venta actualizada: ID {venta_id}")
        else:
            print(f"INFO: Venta ID {venta_id} sin cambios detectados.")
            return jsonify({"message":"No se realizaron cambios."}), 200

        # Devolver venta completa actualizada
        venta_actualizada = db.session.query(Venta).options(
            selectinload(Venta.detalles).selectinload(DetalleVenta.producto),
            selectinload(Venta.usuario_interno), selectinload(Venta.cliente)
        ).get(venta_id)
        return jsonify(venta_a_dict_completo(venta_actualizada))

    except Exception as e: db.session.rollback(); print(f"ERROR [actualizar_venta]: Venta {venta_id} - {e}"); traceback.print_exc(); return jsonify({"error":"ISE"}),500

# --- Endpoint: Eliminar Venta (Sin cambios) ---
@ventas_bp.route('/eliminar/<int:venta_id>', methods=['DELETE'])
@token_required
@roles_required(ROLES['ADMIN'])
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
    """Convierte Venta a diccionario para listas (incluye nombre cliente)."""
    if not venta: return None
    return {
        "venta_id": venta.id,
        "fecha_registro": venta.fecha_registro.isoformat() if venta.fecha_registro else None,
        "fecha_pedido": venta.fecha_pedido.isoformat() if venta.fecha_pedido else None,
        "direccion_entrega": venta.direccion_entrega,
        "nombre_vendedor": venta.nombre_vendedor,
        "usuario_interno_id": venta.usuario_interno_id,
        "usuario_nombre": venta.usuario_interno.nombre if venta.usuario_interno else None,
        "cliente_id": venta.cliente_id,
        # Asume que el modelo Cliente tiene 'razon_social'
        "cliente_nombre": venta.cliente.nombre_razon_social if venta.cliente else None,
        "cuit_cliente": venta.cuit_cliente,
        "monto_total_base": float(venta.monto_total) if venta.monto_total is not None else None,
        "forma_pago": venta.forma_pago,
        "requiere_factura": venta.requiere_factura,
        "monto_final_con_recargos": float(venta.monto_final_con_recargos) if venta.monto_final_con_recargos is not None else None,
    }

def venta_a_dict_completo(venta):
    """Convierte Venta a diccionario completo (incluye cliente y detalles)."""
    if not venta: return None
    # Cargar detalles si es lazy='dynamic'
    detalles_list = venta.detalles.all() if hasattr(venta.detalles, 'all') else venta.detalles

    resumen = venta_a_dict_resumen(venta) # Reutilizar
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
        "producto_codigo": detalle.producto.id if detalle.producto else None, # Usar codigo_interno
        "producto_nombre": detalle.producto.nombre if detalle.producto else None,
        "cantidad": float(detalle.cantidad) if detalle.cantidad is not None else None,
        "margen_aplicado": float(detalle.margen_aplicado) if detalle.margen_aplicado is not None else None,
        "costo_unitario_momento_ars": float(detalle.costo_unitario_momento_ars) if detalle.costo_unitario_momento_ars is not None else None,
        "coeficiente_usado": float(detalle.coeficiente_usado) if detalle.coeficiente_usado is not None else None,
        "precio_unitario_venta_ars": float(detalle.precio_unitario_venta_ars) if detalle.precio_unitario_venta_ars is not None else None,
        "precio_total_item_ars": float(detalle.precio_total_item_ars) if detalle.precio_total_item_ars is not None else None,
        # Opcional: añadir el flag si lo incluiste en el modelo
        # "es_precio_especial": detalle.es_precio_especial
    }
