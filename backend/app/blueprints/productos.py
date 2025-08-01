# app/blueprints/productos.py

from flask import Blueprint, request, jsonify, make_response, current_app, send_file
# Ajusta el import de db y modelos según tu estructura final.
# Si __init__.py está en 'app/' y este archivo está en 'app/blueprints/', '..' es correcto.
from .. import db, models
from ..models import Producto, TipoCambio, Receta, RecetaItem, Cliente, PrecioEspecialCliente # Importa TODOS los modelos necesarios
# Ajusta la ruta a tu módulo core de calculadora
from ..calculator.core import obtener_coeficiente_por_rango
from decimal import Decimal, InvalidOperation, DivisionByZero, ROUND_HALF_UP, ROUND_CEILING
import traceback
import datetime
import math
import jwt
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment
from io import BytesIO # Para
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES

# Crear el Blueprint para productos
productos_bp = Blueprint('productos', __name__, url_prefix='/productos')

# --- Función de Cálculo de Costo en Moneda de Referencia (USD) ---
# En app/blueprints/productos.py

def calcular_costo_producto_referencia(producto_id: int, visited=None) -> Decimal:
    """
    Calcula el costo en USD por UNIDAD DE VENTA (VERSIÓN CORREGIDA).
    Esta versión asume que el 'costo_referencia_usd' de un producto base
    YA ES un costo unitario y no lo divide por la referencia.
    """
    if visited is None:
        visited = set()
    if producto_id in visited:
        raise ValueError(f"Ciclo en recetas para ID {producto_id}")
    visited.add(producto_id)

    producto = db.session.get(Producto, producto_id)
    if not producto:
        raise ValueError(f"Producto ID {producto_id} no encontrado")

    # 1. Inicializamos UNA SOLA variable para el resultado final.
    costo_final_unitario_usd = Decimal('0.0')

    # --- LÓGICA DEL "SWITCH" DE COSTO ---
    if not producto.es_receta or getattr(producto, 'costo_manual_override', False):
        # 2. Si no es receta, el costo final es directamente el valor guardado.
        costo_final_unitario_usd = Decimal(producto.costo_referencia_usd or '0.0')
    else:
        # 3. Si es receta, calculamos y acumulamos en la MISMA variable.
        receta = Receta.query.filter_by(producto_final_id=producto.id).first()
        if receta and receta.items:
            items_receta = receta.items.all() if hasattr(receta.items, 'all') else receta.items
            for item in items_receta:
                if item.ingrediente_id:
                    costo_ingrediente_unitario = calcular_costo_producto_referencia(item.ingrediente_id, visited.copy())
                    porcentaje_item = Decimal(item.porcentaje or '0.0')
                    costo_final_unitario_usd += costo_ingrediente_unitario * (porcentaje_item / Decimal(100))
    
    # La lógica de división por 'ref_calculo' se omite intencionadamente.

    visited.remove(producto_id)
    
    # 4. Devolvemos la variable única, que siempre tendrá el valor correcto.
    return costo_final_unitario_usd.quantize(Decimal("0.0001"))

# --- Función auxiliar para convertir Producto a Dict (Ajustada) ---
def producto_a_dict(producto):
    """Convierte un objeto Producto a un diccionario serializable para JSON."""
    if not producto: return None
    return {
        "id": producto.id,
        "nombre": producto.nombre,
        "unidad_venta": producto.unidad_venta,
        "tipo_calculo": producto.tipo_calculo,
        "ref_calculo": producto.ref_calculo,
        "margen": float(producto.margen) if producto.margen is not None else None,
        "costo_referencia_usd": float(producto.costo_referencia_usd) if producto.costo_referencia_usd is not None else None,
        "es_receta": producto.es_receta,
        "ajusta_por_tc": producto.ajusta_por_tc,
        "fecha_actualizacion_costo": producto.fecha_actualizacion_costo.isoformat() if producto.fecha_actualizacion_costo else None,
    }


@productos_bp.route('/actualizar_costos_por_aumento', methods=['POST'])
@token_required 
def actualizar_costos_por_aumento(current_user):
    """
    Actualiza el costo de un producto base y propaga ese mismo aumento porcentual
    a todos los productos de receta que lo contienen como ingrediente.
    Esta es una actualización en cascada basada en un aumento, no un recálculo desde cero.
    
    Payload:
    {
        "producto_base_id": <id_materia_prima>,
        "porcentaje_aumento": <porcentaje>  // ej: 10 para 10%, -5 para -5%
    }
    """
    data = request.get_json()
    if not data or 'producto_base_id' not in data or 'porcentaje_aumento' not in data:
        return jsonify({"error": "Faltan datos: 'producto_base_id' y 'porcentaje_aumento' son requeridos."}), 400

    try:
        producto_base_id = int(data['producto_base_id'])
        porcentaje_aumento = Decimal(str(data['porcentaje_aumento']))
    except (ValueError, TypeError, InvalidOperation):
        return jsonify({"error": "Datos inválidos. 'producto_base_id' debe ser un entero y 'porcentaje_aumento' un número."}), 400

    producto_base = db.session.get(Producto, producto_base_id)
    if not producto_base:
        return jsonify({"error": f"Producto base con ID {producto_base_id} no encontrado."}), 404

    # El factor por el cual multiplicar (ej: 10% de aumento es 1.10, 5% de descenso es 0.95)
    factor_multiplicador = Decimal('1') + (porcentaje_aumento / Decimal('100'))

    # Lista para guardar la información de los productos actualizados
    actualizaciones_realizadas = []
    
    try:
        # 1. Actualizar el costo del producto base
        costo_anterior_base = producto_base.costo_referencia_usd or Decimal('0.0')
        nuevo_costo_base = costo_anterior_base * factor_multiplicador
        producto_base.costo_referencia_usd = nuevo_costo_base.quantize(Decimal("0.0001"))
        
        actualizaciones_realizadas.append({
            "tipo": "Materia Prima Base",
            "producto_id": producto_base.id,
            "nombre": producto_base.nombre,
            "costo_anterior_usd": float(costo_anterior_base),
            "costo_nuevo_usd": float(producto_base.costo_referencia_usd)
        })

        # 2. Encontrar y actualizar en cascada los productos de receta
        recetas_afectadas_ids = set()
        items_de_receta = RecetaItem.query.filter_by(ingrediente_id=producto_base_id).all()
        for item in items_de_receta:
            if item.receta and item.receta.producto_final:
                recetas_afectadas_ids.add(item.receta.producto_final.id)

        # 3. Aplicar el mismo aumento a cada producto de receta afectado
        for receta_id in recetas_afectadas_ids:
            producto_receta = db.session.get(Producto, receta_id)
            if producto_receta:
                costo_anterior_receta = producto_receta.costo_referencia_usd or Decimal('0.0')
                nuevo_costo_receta = costo_anterior_receta * factor_multiplicador
                producto_receta.costo_referencia_usd = nuevo_costo_receta.quantize(Decimal("0.0001"))
                
                actualizaciones_realizadas.append({
                    "tipo": "Producto de Receta (Afectado)",
                    "producto_id": producto_receta.id,
                    "nombre": producto_receta.nombre,
                    "costo_anterior_usd": float(costo_anterior_receta),
                    "costo_nuevo_usd": float(producto_receta.costo_referencia_usd)
                })

        # 4. Guardar todos los cambios
        db.session.commit()

        return jsonify({
            "message": f"Actualización por aumento del {porcentaje_aumento}% aplicada correctamente.",
            "total_productos_actualizados": len(actualizaciones_realizadas),
            "detalles_actualizacion": actualizaciones_realizadas
        })

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": "Error interno al procesar la actualización de costos."}), 500

# --- Endpoints CRUD para Productos ---

@productos_bp.route('/crear', methods=['POST'])
def crear_producto():
    """Crea un nuevo producto."""
    data = request.get_json()
    if not data or not data.get('id') or not data.get('nombre'):
        return jsonify({"error": "Faltan campos requeridos: 'id', 'nombre'"}), 400

    # Validar si el código ya existe
    if Producto.query.filter_by(id=data['id']).first():
        return jsonify({"error": f"El código interno '{data['id']}' ya existe"}), 409 # Conflict

    try:
        # Manejar costo inicial opcional solo si no es receta
        costo_ref_inicial = None
        if 'costo_referencia_usd' in data and not data.get('es_receta'):
             costo_ref_inicial = Decimal(str(data['costo_referencia_usd']))

        # Crear instancia del modelo
        nuevo_producto = Producto(
            id=data['id'],
            nombre=data['nombre'],
            unidad_venta=data.get('unidad_venta'),
            tipo_calculo=data.get('tipo_calculo'),
            ref_calculo=data.get('ref_calculo'),
            margen=Decimal(str(data['margen'])) if 'margen' in data else None,
            costo_referencia_usd=costo_ref_inicial,
            es_receta=data.get('es_receta', False),
            ajusta_por_tc=data.get('ajusta_por_tc', False) # Asegurar que se puede establecer al crear
        )
        db.session.add(nuevo_producto)
        db.session.commit()
        print(f"INFO: Producto creado: ID {nuevo_producto.id}, Código: {nuevo_producto.id}")
        return jsonify(producto_a_dict(nuevo_producto)), 201 # Created

    except (ValueError, TypeError, InvalidOperation) as e:
         db.session.rollback()
         print(f"ERROR: Datos numéricos inválidos al crear producto - {e}")
         return jsonify({"error": f"Error en los datos numéricos (margen, costo_referencia_usd): {e}"}), 400
    except Exception as e:
        db.session.rollback()
        print(f"ERROR: Excepción inesperada al crear producto {data.get('id', 'N/A')}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al crear el producto"}), 500


@productos_bp.route('/obtener_todos_paginado', methods=['GET'])
def obtener_productos_paginado():
    """Obtiene una lista de productos con paginación."""
    try:
        query = Producto.query.order_by(Producto.nombre)

        # Paginación
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        paginated_productos = query.paginate(page=page, per_page=per_page, error_out=False)
        productos_db = paginated_productos.items

        # Serializar Resultados
        productos_list = [producto_a_dict(p) for p in productos_db]

        return jsonify({
            "productos": productos_list,
            "pagination": {
                "total_items": paginated_productos.total,
                "total_pages": paginated_productos.pages,
                "current_page": page,
                "per_page": per_page,
                "has_next": paginated_productos.has_next,
                "has_prev": paginated_productos.has_prev
            }
        }), 200

    except Exception as e:
        print(f"ERROR [obtener_productos]: Excepción inesperada al obtener productos")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al obtener productos"}), 500

@productos_bp.route('/obtener_todos', methods=['GET'])
def obtener_productos():
    """Obtiene una lista de todos los productos."""
    try:
        # Considerar añadir paginación para listas potencialmente largas
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        productos_paginados = Producto.query.order_by(Producto.nombre).paginate(page=page, per_page=per_page, error_out=False)
        productos = productos_paginados.items
        #pagination_info = {...} # Añadir info de paginación a la respuesta
        productos = Producto.query.order_by(Producto.nombre).all()
        return jsonify([producto_a_dict(p) for p in productos]), 200
    except Exception as e:
        print(f"ERROR: Excepción inesperada al obtener productos")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al obtener productos"}), 500


@productos_bp.route('/obtener/<int:producto_id>', methods=['GET'])
def obtener_producto(producto_id):
    """Obtiene los detalles de un producto específico por su ID."""
    try:
        producto = db.session.get(Producto, producto_id) # Usar .get para PK
        if not producto:
            return jsonify({"error": "Producto no encontrado"}), 404
        return jsonify(producto_a_dict(producto))
    except Exception as e:
        print(f"ERROR: Excepción inesperada al obtener producto {producto_id}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al obtener el producto"}), 500


@productos_bp.route('/actualizar/<int:producto_id>', methods=['PUT'])
def actualizar_producto(producto_id):
    """
    Actualiza un producto. Si se actualiza el costo de una receta,
    se activa el flag 'costo_manual_override'.
    """
    producto = db.session.get(Producto, producto_id)
    if not producto: return jsonify({"error": "Producto no encontrado"}), 404
    data = request.get_json()
    if not data: return jsonify({"error": "No se recibieron datos"}), 400

    try:
        # Actualizar campos básicos
        producto.nombre = data.get('nombre', producto.nombre)
        # ... otros campos que actualizas ...

        # --- LÓGICA DE ACTUALIZACIÓN DE COSTO Y FLAGS (CORREGIDA Y EXPLÍCITA) ---
        
        # Primero, manejamos el flag 'es_receta' si viene en el payload
        if 'es_receta' in data:
            producto.es_receta = data['es_receta']
        
        # Luego, manejamos la actualización del costo
        if 'costo_referencia_usd' in data:
            nuevo_costo_str = data.get('costo_referencia_usd')
            nuevo_costo = Decimal(str(nuevo_costo_str)) if nuevo_costo_str is not None else None
            
            # Siempre guardamos el costo que nos envían
            producto.costo_referencia_usd = nuevo_costo
            
            # AHORA, decidimos el estado del flag 'costo_manual_override'
            if producto.es_receta:
                if nuevo_costo is not None:
                    # Si es una receta y le estamos poniendo un costo, es un override.
                    producto.costo_manual_override = True
                else:
                    # Si es una receta y le quitamos el costo, vuelve a modo automático.
                    producto.costo_manual_override = False
            else:
                # Si no es una receta, el override no tiene sentido. Lo dejamos en False.
                producto.costo_manual_override = False

        db.session.commit()
        return jsonify(producto_a_dict(producto))

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": "Error interno al actualizar el producto"}), 500


@productos_bp.route('/eliminar/<int:producto_id>', methods=['DELETE'])
def eliminar_producto(producto_id):
    """Elimina un producto."""
    producto = db.session.get(Producto, producto_id)
    if not producto:
        return jsonify({"error": "Producto no encontrado"}), 404

    # Verificación de dependencia: ¿Es ingrediente en alguna receta?
    # Usar .first() es eficiente para saber si existe al menos uno.
    if RecetaItem.query.filter_by(ingrediente_id=producto_id).first():
        return jsonify({"error": f"No se puede eliminar '{producto.nombre}', es ingrediente en una o más recetas."}), 409 # Conflict

    # Si el producto es una receta, la relación Producto->Receta con cascade="all, delete-orphan"
    # debería eliminar la receta y sus RecetaItems asociados automáticamente al borrar el producto.

    try:
        nombre_eliminado = producto.nombre
        codigo_eliminado = producto.id
        db.session.delete(producto)
        db.session.commit()
        print(f"INFO: Producto eliminado: ID {producto_id}, Código: {codigo_eliminado}, Nombre: {nombre_eliminado}")
        return jsonify({"message": f"Producto '{nombre_eliminado}' eliminado correctamente"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"ERROR: Excepción inesperada al eliminar producto {producto_id}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al eliminar el producto"}), 500


# --- Endpoint para obtener costos calculados ---
@productos_bp.route('/obtener_costos/<int:producto_id>/costos', methods=['GET'])
def obtener_costos_producto(producto_id):
    """Devuelve el costo en moneda referencia (USD) y el costo final en ARS (convertido)."""
    producto = db.session.get(Producto, producto_id)
    if not producto:
        return jsonify({"error": "Producto no encontrado"}), 404

    try:
        # 1. Calcular costo en USD
        costo_ref_usd = calcular_costo_producto_referencia(producto_id)

        # 2. Calcular costo en ARS
        costo_ars_calculado = None
        error_ars = None
        nombre_tc_aplicar = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
        tipo_cambio = TipoCambio.query.filter_by(nombre=nombre_tc_aplicar).first()

        if not tipo_cambio or tipo_cambio.valor is None or tipo_cambio.valor <= 0:
             error_ars = f"Tipo de cambio '{nombre_tc_aplicar}' no válido o no encontrado."
             print(f"WARN: {error_ars} al calcular costo ARS para producto {producto_id}")
        else:
             # Convertir USD -> ARS
             costo_ars_calculado = (costo_ref_usd * tipo_cambio.valor).quantize(Decimal("0.01")) # Redondear a 2 dec para ARS

        return jsonify({
            "producto_id": producto_id,
            "id": producto.id,
            "nombre": producto.nombre,
            "costo_referencia_usd": float(costo_ref_usd), # Costo base de cálculo
            "costo_final_venta_ars": float(costo_ars_calculado) if costo_ars_calculado is not None else None, # Costo a usar en precio venta
            "tipo_cambio_aplicado": {
                "nombre": nombre_tc_aplicar,
                "valor": float(tipo_cambio.valor) if tipo_cambio and tipo_cambio.valor is not None else None
            },
            "error_calculo_ars": error_ars,
            "fecha_actualizacion_costo": producto.fecha_actualizacion_costo.isoformat() if producto.fecha_actualizacion_costo else None
        })
    except ValueError as e: # Errores conocidos de calcular_costo_producto_referencia
        print(f"ERROR: ValueError calculando costos para producto {producto_id}: {e}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"ERROR: Excepción inesperada calculando costos para producto {producto_id}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al calcular costos"}), 500


# --- Endpoint para Actualizar Costo desde Compras ---
@productos_bp.route('/actualizar_costo/<int:producto_id>/actualizar_costo_compra', methods=['POST'])
def actualizar_costo_desde_compra(producto_id):
    """
    Recibe el costo de compra en ARS y actualiza el costo_referencia_usd.
    Payload: {"costo_recepcion_ars": 1234.56}
    """
    producto = db.session.get(Producto, producto_id)
    if not producto:
        return jsonify({"error": "Producto no encontrado"}), 404

    if producto.es_receta:
         # Los costos de recetas se derivan de sus ingredientes
         return jsonify({"error": "No se puede actualizar costo directamente para un producto de receta. Actualice el costo de sus ingredientes."}), 400

    data = request.get_json()
    if not data or 'costo_recepcion_ars' not in data:
         return jsonify({"error": "Falta el campo 'costo_recepcion_ars' en el payload"}), 400

    try:
        costo_recepcion_ars = Decimal(str(data['costo_recepcion_ars']))
        if costo_recepcion_ars < 0:
             return jsonify({"error": "El costo de recepción no puede ser negativo"}), 400

        # Determinar qué TC usar para la conversión inversa (ARS -> USD)
        nombre_tc_conversion = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
        tipo_cambio = TipoCambio.query.filter_by(nombre=nombre_tc_conversion).first()

        # Validar que el tipo de cambio exista y sea válido para dividir
        if not tipo_cambio or tipo_cambio.valor is None or tipo_cambio.valor <= 0:
            # No se puede convertir, devolver error claro
            raise ValueError(f"Tipo de cambio '{nombre_tc_conversion}' no encontrado o no es válido (cero o negativo) para realizar la conversión.")

        # Calcular nuevo costo referencia USD = ARS / TC
        nuevo_costo_ref_usd = (costo_recepcion_ars / tipo_cambio.valor).quantize(Decimal("0.0001")) # 4 decimales USD

        print(f"INFO: Actualizando costo producto ID {producto_id} ({producto.id}). Recepción ARS: {costo_recepcion_ars}, TC: {nombre_tc_conversion} ({tipo_cambio.valor}), Nuevo Costo Ref USD: {nuevo_costo_ref_usd}")

        # Actualizar el costo en el producto
        producto.costo_referencia_usd = nuevo_costo_ref_usd
        # La fecha se actualiza via onupdate en el modelo

        db.session.commit()

        return jsonify({
            "message": "Costo de referencia actualizado exitosamente",
            "producto_id": producto_id,
            "id": producto.id,
            "nuevo_costo_referencia_usd": float(nuevo_costo_ref_usd)
        })

    except (ValueError, TypeError, InvalidOperation) as e:
        db.session.rollback()
        print(f"ERROR: Datos inválidos o error de TC al actualizar costo compra para producto {producto_id} - {e}")
        return jsonify({"error": f"Error en datos o tipo de cambio: {e}"}), 400
    except DivisionByZero:
         db.session.rollback()
         print(f"ERROR: División por cero. TC '{nombre_tc_conversion}' es cero para producto {producto_id}")
         return jsonify({"error": f"Error crítico: El tipo de cambio '{nombre_tc_conversion}' es cero."}), 400
    except Exception as e:
        db.session.rollback()
        print(f"ERROR: Excepción inesperada al actualizar costo compra para producto {producto_id}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al actualizar el costo"}), 500


# --- Endpoint para Calcular Precio de Venta Final ---
def redondear_a_siguiente_decena(valor_decimal: Decimal) -> Decimal:
    """
    Redondea un valor Decimal hacia arriba al siguiente múltiplo de 10.
    """
    if not isinstance(valor_decimal, Decimal):
        valor_decimal = Decimal(str(valor_decimal))
    # Redondea hacia el techo al múltiplo de 10 más cercano
    valor_redondeado = (valor_decimal / 10).quantize(Decimal('1'), rounding=ROUND_CEILING) * 10
    # Asegura que el resultado final tenga 2 decimales para consistencia
    return valor_redondeado.quantize(Decimal("0.01"))


@productos_bp.route('/calcular_precio/<int:product_id>', methods=['POST'])
def calculate_price(product_id: int):
    """
    Versión final que combina:
    - Búsqueda de coeficiente.
    - Lógica híbrida de cantidad (<1 vs >=1) que usa el VALOR DEL ESCALÓN.
    - Debugging completo.
    """
    debug_info_response = {"etapas_calculo": []}
    detalles_calculo_dinamico = {}

    try:
        producto = db.session.get(Producto, product_id)
        if not producto: return jsonify({"status": "error", "message": "Producto no encontrado"}), 404
        
        data = request.get_json()
        if not data or 'quantity' not in data: return jsonify({"status": "error", "message": "Falta 'quantity'"}), 400
        
        quantity_str = str(data['quantity']).strip().replace(',', '.')
        cantidad_decimal = Decimal(quantity_str)
        if cantidad_decimal <= Decimal('0'): raise ValueError("La cantidad debe ser positiva.")
        
        # --- PRIORIDAD 1: PRECIO ESPECIAL ---
        precio_venta_unitario_bruto = None
        se_aplico_precio_especial = False
        cliente_id_payload = data.get('cliente_id')
        if cliente_id_payload:
            try:
                cliente_id = int(cliente_id_payload)
                precio_especial_db = PrecioEspecialCliente.query.filter_by(cliente_id=cliente_id, producto_id=product_id, activo=True).first()
                if precio_especial_db and precio_especial_db.precio_unitario_fijo_ars is not None:
                    precio_venta_unitario_bruto = Decimal(str(precio_especial_db.precio_unitario_fijo_ars))
                    se_aplico_precio_especial = True
                    debug_info_response['etapas_calculo'].append("INICIO: LÓGICA DE PRECIO ESPECIAL APLICADA.")
            except (ValueError, TypeError):
                debug_info_response['etapas_calculo'].append("WARN: Cliente ID inválido, se ignora.")

        # --- CÁLCULO DINÁMICO ---
        if not se_aplico_precio_especial:
            debug_info_response['etapas_calculo'].append("INICIO: CÁLCULO DINÁMICO")

            # PASO 1 y 2: Obtener Precio Base Unitario en ARS (con margen)
            costo_unitario_venta_usd = calcular_costo_producto_referencia(product_id)
            nombre_tc = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
            tc_obj = TipoCambio.query.filter_by(nombre=nombre_tc).first()
            if not tc_obj or tc_obj.valor <= 0: raise ValueError(f"TC '{nombre_tc}' inválido.")
            costo_unitario_venta_ars = costo_unitario_venta_usd * tc_obj.valor
            margen = Decimal(str(producto.margen or '0.0'))
            if not (Decimal('0') <= margen < Decimal('1')): raise ValueError("Margen inválido.")
            precio_base_ars = costo_unitario_venta_ars / (Decimal('1') - margen)
            
            detalles_calculo_dinamico['A_COSTO_UNITARIO_USD'] = f"{costo_unitario_venta_usd:.4f}"
            detalles_calculo_dinamico['B_PRECIO_BASE_ARS_CON_MARGEN'] = f"{precio_base_ars:.4f}"
            debug_info_response['etapas_calculo'].append(f"1. Precio Base ARS (unitario, con margen): {precio_base_ars.quantize(Decimal('0.01'))}")

            # PASO 3: Obtener Coeficiente y Límite del Escalón
            resultado_tabla = obtener_coeficiente_por_rango(str(producto.ref_calculo or ''), quantity_str, producto.tipo_calculo)
            if resultado_tabla is None: raise ValueError("No se encontró coeficiente en la matriz.")
            coeficiente_str, escalon_cantidad_str = resultado_tabla
            if not coeficiente_str or coeficiente_str.strip() == '': raise ValueError("Producto no disponible en esta cantidad.")
            coeficiente_decimal = Decimal(coeficiente_str)

            detalles_calculo_dinamico['C_COEFICIENTE_DE_MATRIZ'] = f"{coeficiente_decimal}"
            detalles_calculo_dinamico['D_ESCALON_CANTIDAD_MATRIZ'] = escalon_cantidad_str
            debug_info_response['etapas_calculo'].append(f"2. Coeficiente para Qty {cantidad_decimal} es: {coeficiente_decimal} (del tier <= {escalon_cantidad_str})")

            # --- PASO 4: LÓGICA HÍBRIDA CON LA CORRECCIÓN FINAL ---
            if cantidad_decimal >= Decimal('1.0'):
                precio_venta_unitario_bruto = precio_base_ars * coeficiente_decimal
                debug_info_response['etapas_calculo'].append(f"3. [Cant >= 1] P. Venta Unitario Bruto (P.Base * Coef): {precio_venta_unitario_bruto:.4f}")
            else: # cantidad < 1.0
                precio_para_la_fraccion = precio_base_ars * coeficiente_decimal
                escalon_decimal = Decimal(escalon_cantidad_str)
                if escalon_decimal == Decimal('0'): raise ValueError("El escalón de la matriz no puede ser cero.")
                
                # SE DIVIDE POR EL ESCALÓN, NO POR LA CANTIDAD SOLICITADA
                precio_venta_unitario_bruto = precio_para_la_fraccion / escalon_decimal
                debug_info_response['etapas_calculo'].append(f"3. [Cant < 1] P. Venta Unitario Bruto ((P.Base * Coef) / Escalón): {precio_venta_unitario_bruto:.4f}")
            
            detalles_calculo_dinamico['E_PRECIO_VENTA_UNITARIO_BRUTO'] = f"{precio_venta_unitario_bruto:.4f}"

        # --- PASO 5: REDONDEO Y TOTAL ---
        if precio_venta_unitario_bruto is None: raise ValueError("Fallo en la lógica: no se pudo determinar un precio.")

        precio_venta_unitario_redondeado = redondear_a_siguiente_decena(precio_venta_unitario_bruto)
        precio_total_final_ars = redondear_a_siguiente_decena(precio_venta_unitario_redondeado * cantidad_decimal)
        detalles_calculo_dinamico['F_PRECIO_UNITARIO_REDONDEADO'] = f"{precio_venta_unitario_redondeado:.2f}"
        detalles_calculo_dinamico['G_PRECIO_TOTAL_FINAL_REDONDEADO'] = f"{precio_total_final_ars:.2f}"
        debug_info_response['etapas_calculo'].append(f"4. Redondeo Final (Unitario): {precio_venta_unitario_bruto:.4f} -> {precio_venta_unitario_redondeado}")
        debug_info_response['etapas_calculo'].append(f"5. Total Final: {precio_venta_unitario_redondeado * cantidad_decimal:.2f} -> {precio_total_final_ars}")

        # --- PASO 6: RESPUESTA JSON ---
        response_data = {
            "status": "success",
            "product_id_solicitado": product_id,
            "nombre_producto": producto.nombre,
            "cantidad_solicitada": float(cantidad_decimal),
            "es_precio_especial": se_aplico_precio_especial,
            "precio_venta_unitario_ars": float(precio_venta_unitario_redondeado),
            "precio_total_calculado_ars": float(precio_total_final_ars),
            "debug_info_completo": {
                "resumen_pasos": debug_info_response["etapas_calculo"],
                "desglose_variables": detalles_calculo_dinamico if not se_aplico_precio_especial else None
            }
        }
        return jsonify(response_data), 200

    except (ValueError, InvalidOperation) as e:
        return jsonify({"status": "error", "message": str(e)}), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Error interno del servidor."}), 500


@productos_bp.route('/recalcular_costo/<int:producto_id>', methods=['GET'])
def recalcular_costo(producto_id):
    """
    Endpoint para el botón. Calcula el costo de una receta y lo devuelve.
    NO GUARDA NADA.
    """
    producto = db.session.get(models.Producto, producto_id)
    if not producto: return jsonify({"error": "Producto no encontrado"}), 404
    if not producto.es_receta: return jsonify({"error": "Esta operación solo es válida para recetas."}), 400

    try:
        costo_calculado = calcular_costo_producto_referencia(producto_id)
        return jsonify({"status": "success", "costo_calculado_usd": float(costo_calculado)})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500
    
