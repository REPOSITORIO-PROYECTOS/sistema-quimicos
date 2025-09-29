# app/blueprints/productos.py

from flask import Blueprint, request, jsonify, make_response, current_app, send_file
from app import cache
# Ajusta el import de db y modelos según tu estructura final.
# Si __init__.py está en 'app/' y este archivo está en 'app/blueprints/', '..' es correcto.
from .. import db, models
from ..models import Producto, TipoCambio, Receta, RecetaItem, Cliente, PrecioEspecialCliente, DetalleOrdenCompra, DetalleVenta, ComboComponente # Importa TODOS los modelos necesarios
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
        "activo": producto.activo,
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
    

@productos_bp.route('/obtener_todos_paginado_activos', methods=['GET'])
def obtener_productos_paginado_activos():
    """Obtiene una lista de productos con paginación."""
    try:
        query = Producto.query.order_by(Producto.nombre)

        # Paginación
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        paginated_productos = query.paginate(page=page, per_page=per_page, error_out=False)
        productos_db = paginated_productos.items

        # Serializar Resultados
        productos_list = [producto_a_dict(p) for p in productos_db if p.activo]

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
@cache.cached(timeout=240)
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


@productos_bp.route('/obtener_todos_activos', methods=['GET'])
def obtener_productos_activos():
    """Obtiene una lista de todos los productos."""
    try:
        # Considerar añadir paginación para listas potencialmente largas
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        productos_paginados = Producto.query.order_by(Producto.nombre).paginate(page=page, per_page=per_page, error_out=False)
        productos = productos_paginados.items
        #pagination_info = {...} # Añadir info de paginación a la respuesta
        productos = Producto.query.order_by(Producto.nombre).all()
        return jsonify([producto_a_dict(p) for p in productos if p.activo]), 200
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
        producto.margen = data.get('margen', producto.margen)
        
        producto.ref_calculo = data.get('ref_calculo', producto.ref_calculo)
        producto.tipo_calculo = data.get('tipo_calculo', producto.tipo_calculo)
        producto.unidad_venta = data.get('unidad_venta', producto.unidad_venta)
        producto.ajusta_por_tc = data.get('ajusta_por_tc', producto.ajusta_por_tc)
        producto.activo = data.get('activo',producto.activo)
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
@token_required
@roles_required(ROLES['ADMIN'])
def eliminar_producto(current_user, producto_id):
    """
    [VERSIÓN FINAL] Elimina un producto. Analiza TODAS las dependencias (incluyendo combos)
    y permite forzar la eliminación en cascada.
    """
    producto = db.session.get(Producto, producto_id)
    if not producto:
        return jsonify({"error": "Producto no encontrado"}), 404

    # --- ETAPA DE ANÁLISIS ---
    recetas_donde_es_ingrediente = db.session.query(RecetaItem).filter_by(ingrediente_id=producto_id).all()
    precios_especiales = db.session.query(PrecioEspecialCliente).filter_by(producto_id=producto_id).all()
    detalles_venta = db.session.query(DetalleVenta).filter_by(producto_id=producto_id).all()
    detalles_compra = db.session.query(DetalleOrdenCompra).filter_by(producto_id=producto_id).all()
    componentes_combo = db.session.query(ComboComponente).filter_by(producto_id=producto_id).all()
    
    dependencias_encontradas = any([
        recetas_donde_es_ingrediente, 
        precios_especiales, 
        detalles_venta, 
        detalles_compra,
        componentes_combo
    ])
    
    forzar_eliminacion = request.args.get('forzar', 'false').lower() == 'true'

    if dependencias_encontradas and not forzar_eliminacion:
        # --- MODO ANÁLISIS ---
        detalle_recetas = []
        for item in recetas_donde_es_ingrediente:
            if item.receta and item.receta.producto_final:
                detalle_recetas.append(f"Receta para '{item.receta.producto_final.nombre}'")
            else:
                detalle_recetas.append(f"Receta ID {item.receta_id} (datos inconsistentes)")
        
        detalle_combos = []
        for item in componentes_combo:
            if item.combo:
                detalle_combos.append(f"Combo '{item.combo.nombre}'")

        informe = {
            "error": f"No se puede eliminar '{producto.nombre}' porque tiene dependencias activas.",
            "mensaje_accion": "Para eliminar este producto y todas sus dependencias, vuelva a realizar esta petición añadiendo el parámetro '?forzar=true'.",
            "dependencias": {
                "es_ingrediente_en_recetas": {
                    "cantidad": len(recetas_donde_es_ingrediente),
                    "detalle": detalle_recetas
                },
                "precios_especiales": { "cantidad": len(precios_especiales) },
                "detalles_venta": { "cantidad": len(detalles_venta) },
                "detalles_compra": { "cantidad": len(detalles_compra) },
                "es_componente_en_combos": {
                    "cantidad": len(componentes_combo),
                    "detalle": detalle_combos
                }
            }
        }
        return jsonify(informe), 409

    # --- MODO EJECUCIÓN ---
    try:
        nombre_eliminado = producto.nombre
        items_a_eliminar = (
            recetas_donde_es_ingrediente + 
            precios_especiales + 
            detalles_venta + 
            detalles_compra +
            componentes_combo
        )

        for item in items_a_eliminar:
            db.session.delete(item)
            
        db.session.delete(producto)
        db.session.commit()
        
        mensaje = f"Producto '{nombre_eliminado}' eliminado correctamente."
        if dependencias_encontradas:
            mensaje += " Todas sus dependencias también fueron eliminadas."
            
        return jsonify({"message": mensaje}), 200

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": "Error interno al procesar la eliminación", "detalle": str(e)}), 500


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
    Redondea un valor Decimal hacia arriba al siguiente múltiplo de 10 y luego redondea al 100 más cercano.
    """
    if not isinstance(valor_decimal, Decimal):
        valor_decimal = Decimal(str(valor_decimal))

    # Redondeo hacia arriba al siguiente múltiplo de 10
    valor_redondeado = (valor_decimal / 10).quantize(Decimal('1'), rounding=ROUND_CEILING) * 10


    return valor_redondeado.quantize(Decimal("0.01"))

def redondear_a_siguiente_centena(valor_decimal: Decimal) -> Decimal:
    """
    Redondea un valor Decimal hacia arriba al siguiente múltiplo de 100.
    Ejemplo: 333.31 → 400
    """
    if not isinstance(valor_decimal, Decimal):
        valor_decimal = Decimal(str(valor_decimal))

    return (valor_decimal / Decimal('100')).quantize(Decimal('1'), rounding=ROUND_CEILING) * Decimal('100')



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
    unit_price_locked = False  # se setea en True si se aplica congelamiento (freeze)
    es_precio_especial_margen = False  # distingue especial margen vs fijo
    precio_especial_db = None  # referencia segura para bloque freeze

    try:
        producto = db.session.get(Producto, product_id)
        if not producto: return jsonify({"status": "error", "message": "Producto no encontrado"}), 404
        
        data = request.get_json()
        if not data or 'quantity' not in data: return jsonify({"status": "error", "message": "Falta 'quantity'"}), 400
        
        quantity_str = str(data['quantity']).strip().replace(',', '.')
        cantidad_decimal = Decimal(quantity_str)
        if cantidad_decimal <= Decimal('0'): raise ValueError("La cantidad debe ser positiva.")

        # Parseo robusto de freeze_unit_price
        freeze_raw = data.get('freeze_unit_price', False)
        if isinstance(freeze_raw, bool):
            freeze_unit_price = freeze_raw
        elif isinstance(freeze_raw, (int, float)):
            freeze_unit_price = bool(freeze_raw)
        elif isinstance(freeze_raw, str):
            freeze_unit_price = freeze_raw.strip().lower() in ('1','true','si','sí','y','yes','t','on')
        else:
            freeze_unit_price = False
        
        # --- PRIORIDAD 1: PRECIO ESPECIAL ---
        precio_venta_unitario_bruto = None
        se_aplico_precio_especial = False
        cliente_id_payload = data.get('cliente_id')
        if cliente_id_payload:
            try:
                cliente_id = int(cliente_id_payload)
                precio_especial_db = PrecioEspecialCliente.query.filter_by(cliente_id=cliente_id, producto_id=product_id, activo=True).first()
                if precio_especial_db:
                    # --- NUEVA LÓGICA: soportar precio especial "con margen" (usar_precio_base=True) igual que en utils ---
                    if getattr(precio_especial_db, 'usar_precio_base', False):
                        es_precio_especial_margen = True
                        # 1. Costo unitario USD y conversión a ARS según TC elegido por el producto
                        costo_unitario_venta_usd = calcular_costo_producto_referencia(product_id)
                        nombre_tc = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
                        tc_obj = TipoCambio.query.filter_by(nombre=nombre_tc).first()
                        if not tc_obj or tc_obj.valor is None or tc_obj.valor <= 0:
                            raise ValueError(f"TC '{nombre_tc}' inválido para precio especial margen.")
                        costo_unitario_venta_ars = costo_unitario_venta_usd * tc_obj.valor
                        # 2. Reconstruir precio base aplicando margen propio del producto
                        margen_producto = Decimal(str(producto.margen or '0'))
                        if not (Decimal('0') <= margen_producto < Decimal('1')):
                            raise ValueError(f"Margen de producto inválido: {margen_producto}")
                        precio_base_ars = costo_unitario_venta_ars / (Decimal('1') - margen_producto)
                        # 3. Obtener coeficiente de matriz y escalón
                        resultado_tabla = obtener_coeficiente_por_rango(str(producto.ref_calculo or ''), quantity_str, producto.tipo_calculo)
                        if resultado_tabla is None:
                            raise ValueError("No se encontró coeficiente para precio especial con margen.")
                        coeficiente_str, escalon_cantidad_str = resultado_tabla
                        if not coeficiente_str or coeficiente_str.strip() == '':
                            raise ValueError("Coeficiente vacío para precio especial con margen.")
                        coeficiente_decimal = Decimal(coeficiente_str)
                        # 4. Precio dinámico base (misma lógica híbrida que cálculo normal)
                        if cantidad_decimal >= Decimal('1.0'):
                            precio_dinamico_base = precio_base_ars * coeficiente_decimal
                        else:
                            escalon_decimal = Decimal(escalon_cantidad_str)
                            if escalon_decimal == 0:
                                raise ValueError("Escalón = 0 en precio especial con margen.")
                            precio_dinamico_base = (precio_base_ars * coeficiente_decimal) / escalon_decimal
                        # 5. Aplicar margen especial (fracción, ej 0.25 = +25%)
                        margen_especial = Decimal(str(precio_especial_db.margen_sobre_base or '0'))
                        if margen_especial < Decimal('-0.99'):
                            raise ValueError(f"Margen especial demasiado negativo: {margen_especial}")
                        precio_venta_unitario_bruto = precio_dinamico_base * (Decimal('1') + margen_especial)
                        if precio_venta_unitario_bruto <= 0:
                            raise ValueError("Resultado de precio especial con margen <= 0")
                        se_aplico_precio_especial = True
                        debug_info_response['etapas_calculo'].append(
                            f"INICIO: PRECIO ESPECIAL CON MARGEN aplicado (margen_especial={margen_especial*100:.2f}%, margen_producto={margen_producto*100:.2f}%, coef={coeficiente_decimal})"
                        )
                        debug_info_response['etapas_calculo'].append(
                            f"DEBUG: costo_usd={costo_unitario_venta_usd:.4f} tc={tc_obj.valor} costo_ars={costo_unitario_venta_ars:.4f} base_ars={precio_base_ars:.4f}"
                        )
                        debug_info_response['etapas_calculo'].append(
                            f"DEBUG: precio_dinamico_base={precio_dinamico_base:.4f} precio_bruto_especial={precio_venta_unitario_bruto:.4f}"
                        )
                    else:
                        # Mantener comportamiento existente para precio especial fijo usando la lógica de ventas
                        from app.blueprints.ventas import calcular_precio_item_venta
                        precio_unitario, precio_total, costo_momento, coeficiente, error_msg, es_precio_especial = calcular_precio_item_venta(
                            product_id, cantidad_decimal, cliente_id
                        )
                        if es_precio_especial and precio_unitario is not None:
                            precio_venta_unitario_bruto = Decimal(str(precio_unitario))
                            se_aplico_precio_especial = True
                            debug_info_response['etapas_calculo'].append("INICIO: PRECIO ESPECIAL FIJO APLICADO.")
                        elif error_msg:
                            debug_info_response['etapas_calculo'].append(f"WARN: Error en precio especial - {error_msg}")
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

        # --- FREEZE UNITARIO (antes de redondeos) ---
        # Reglas nuevas: siempre que sea precio especial (fijo o margen) el unitario se congela (usa coeficiente qty=1 en caso margen)
        if se_aplico_precio_especial and not freeze_unit_price:
            freeze_unit_price = True
            debug_info_response['etapas_calculo'].append("FREEZE AUTO: Activado por ser precio especial.")
        if precio_venta_unitario_bruto is None:
            raise ValueError("Fallo en la lógica: no se pudo determinar un precio.")

        if freeze_unit_price:
            # Caso 1: precio especial fijo -> ya es independiente de la cantidad
            if se_aplico_precio_especial and not es_precio_especial_margen:
                unit_price_locked = True
                debug_info_response['etapas_calculo'].append("FREEZE: Precio especial fijo ya era invariable (sin recálculo).")
            else:
                # Recalcular unitario como si cantidad = 1 usando misma lógica (dynamic o especial margen)
                try:
                    if se_aplico_precio_especial and es_precio_especial_margen and precio_especial_db:
                        # Repetimos pipeline especial margen para qty=1
                        costo_unitario_venta_usd_fr = calcular_costo_producto_referencia(product_id)
                        nombre_tc_fr = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
                        tc_obj_fr = TipoCambio.query.filter_by(nombre=nombre_tc_fr).first()
                        if not tc_obj_fr or tc_obj_fr.valor is None or tc_obj_fr.valor <= 0:
                            raise ValueError("TC inválido en freeze especial margen.")
                        costo_unitario_venta_ars_fr = costo_unitario_venta_usd_fr * tc_obj_fr.valor
                        margen_producto_fr = Decimal(str(producto.margen or '0'))
                        precio_base_ars_fr = costo_unitario_venta_ars_fr / (Decimal('1') - margen_producto_fr)
                        resultado_tabla_fr = obtener_coeficiente_por_rango(str(producto.ref_calculo or ''), '1', producto.tipo_calculo)
                        if resultado_tabla_fr is None:
                            raise ValueError("No hay coeficiente qty=1 en freeze especial margen.")
                        coef_str_fr, _esc_fr = resultado_tabla_fr
                        coef_fr = Decimal(coef_str_fr)
                        precio_dinamico_base_fr = precio_base_ars_fr * coef_fr  # qty=1 => camino normal >=1
                        margen_especial_fr = Decimal(str(precio_especial_db.margen_sobre_base or '0'))
                        precio_venta_unitario_bruto = precio_dinamico_base_fr * (Decimal('1') + margen_especial_fr)
                    else:
                        # Dinámico estándar
                        costo_unitario_venta_usd_fr = calcular_costo_producto_referencia(product_id)
                        nombre_tc_fr = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
                        tc_obj_fr = TipoCambio.query.filter_by(nombre=nombre_tc_fr).first()
                        if not tc_obj_fr or tc_obj_fr.valor is None or tc_obj_fr.valor <= 0:
                            raise ValueError("TC inválido en freeze dinámico.")
                        costo_unitario_venta_ars_fr = costo_unitario_venta_usd_fr * tc_obj_fr.valor
                        margen_fr = Decimal(str(producto.margen or '0'))
                        precio_base_ars_fr = costo_unitario_venta_ars_fr / (Decimal('1') - margen_fr)
                        resultado_tabla_fr = obtener_coeficiente_por_rango(str(producto.ref_calculo or ''), '1', producto.tipo_calculo)
                        if resultado_tabla_fr is None:
                            raise ValueError("No hay coeficiente qty=1 en freeze dinámico.")
                        coef_str_fr, _esc_fr = resultado_tabla_fr
                        coef_fr = Decimal(coef_str_fr)
                        precio_venta_unitario_bruto = precio_base_ars_fr * coef_fr
                    if precio_venta_unitario_bruto <= 0:
                        raise ValueError("Freeze produjo precio <= 0")
                    unit_price_locked = True
                    debug_info_response['etapas_calculo'].append("FREEZE: Recalculado unitario con qty=1 (precio unitario congelado).")
                except Exception as fr_e:
                    debug_info_response['etapas_calculo'].append(f"FREEZE: Error al congelar precio - {fr_e}")

        # --- PASO 5: REDONDEO Y TOTAL ---
        if precio_venta_unitario_bruto is None: raise ValueError("Fallo en la lógica: no se pudo determinar un precio.")

        # UNIFICADO: Redondeo unitario depende de precio especial
        if se_aplico_precio_especial:
            # Para precios especiales, redondear a decena (múltiplo de 10)
            precio_venta_unitario_redondeado = redondear_a_siguiente_decena(precio_venta_unitario_bruto)
            tipo_redondeo_unitario = 'decena'
        else:
            # Para precios generales, redondear a centena (múltiplo de 10)
            precio_venta_unitario_redondeado = redondear_a_siguiente_decena(precio_venta_unitario_bruto)
            tipo_redondeo_unitario = 'decena'

        # Paso 5 bis: Redondear total según tipo de precio
        if se_aplico_precio_especial:
            # Para precios especiales, redondear total a decena
            precio_total_final_ars = redondear_a_siguiente_decena(precio_venta_unitario_redondeado * cantidad_decimal)
            tipo_redondeo_total = 'decena'
        else:
            # Para precios generales, redondear total a centena
            precio_total_final_ars = redondear_a_siguiente_centena(precio_venta_unitario_redondeado * cantidad_decimal)
            tipo_redondeo_total = 'centena'
        debug_info_response['etapas_calculo'].append(
            f"5. Total Final (Redondeo Total {tipo_redondeo_total}): {precio_venta_unitario_redondeado * cantidad_decimal:.2f} -> {precio_total_final_ars}"
        )

        detalles_calculo_dinamico['F_PRECIO_UNITARIO_REDONDEADO'] = f"{precio_venta_unitario_redondeado:.2f}"
        detalles_calculo_dinamico['G_PRECIO_TOTAL_FINAL_REDONDEADO'] = f"{precio_total_final_ars:.2f}"
        debug_info_response['etapas_calculo'].append(
            f"4. Redondeo Final (Unitario): {precio_venta_unitario_bruto:.4f} -> {precio_venta_unitario_redondeado}"
        )

        # --- PASO 6: RESPUESTA JSON ---
        response_data = {
            "status": "success",
            "product_id_solicitado": product_id,
            "nombre_producto": producto.nombre,
            "cantidad_solicitada": float(cantidad_decimal),
            "es_precio_especial": se_aplico_precio_especial,
            "precio_venta_unitario_ars": float(precio_venta_unitario_redondeado),
            "precio_total_calculado_ars": float(precio_total_final_ars),
            "tipo_redondeo_aplicado": tipo_redondeo_unitario,
            "tipo_redondeo_total": tipo_redondeo_total,
            "freeze_unit_price_solicitado": bool(freeze_unit_price),
            "unit_price_locked": unit_price_locked,
            "modo_precio_especial": ("margen" if se_aplico_precio_especial and es_precio_especial_margen else ("fijo" if se_aplico_precio_especial else None)),
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
    
