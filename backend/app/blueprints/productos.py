# app/blueprints/productos.py

from flask import Blueprint, request, jsonify
# Ajusta el import de db y modelos según tu estructura final.
# Si __init__.py está en 'app/' y este archivo está en 'app/blueprints/', '..' es correcto.
from .. import db
from ..models import Producto, TipoCambio, Receta, RecetaItem # Importa TODOS los modelos necesarios
# Ajusta la ruta a tu módulo core de calculadora
from ..calculator.core import obtener_coeficiente_por_rango
from decimal import Decimal, InvalidOperation, DivisionByZero
import traceback
import datetime

# Crear el Blueprint para productos
productos_bp = Blueprint('productos', __name__, url_prefix='/productos')

# --- Función de Cálculo de Costo en Moneda de Referencia (USD) ---
def calcular_costo_producto_referencia(producto_id, visited=None):
    """
    Calcula el costo de un producto en la moneda de REFERENCIA (ej: USD).
    Si es receta, suma los costos de referencia ponderados de los ingredientes.
    Si es materia prima, devuelve su 'costo_referencia_usd'.
    Maneja detección de ciclos.
    """
    if visited is None: visited = set()
    if producto_id in visited:
        # Evita recursión infinita si una receta se incluye a sí misma (directa o indirectamente)
        raise ValueError(f"Ciclo detectado en recetas calculando costo ref para producto ID {producto_id}")
    visited.add(producto_id)

    # Usar .with_for_update() podría ser útil si hay escrituras concurrentes, pero aquí es solo lectura.
    producto = db.session.get(Producto, producto_id) # .get es más eficiente para buscar por PK
    if not producto:
        raise ValueError(f"Producto con ID {producto_id} no encontrado")

    costo_calculado_ref = Decimal(0)

    if not producto.es_receta:
        # Materia Prima o producto comprado directamente: usa su costo_referencia_usd
        costo_calculado_ref = Decimal(producto.costo_referencia_usd) if producto.costo_referencia_usd is not None else Decimal(0)
    else:
        # Es una receta: calcular sumando costos de referencia de ingredientes ponderados
        if not producto.receta:
            # Caso borde: Marcado como receta pero sin relación/items definidos
            print(f"WARN: Producto {producto_id} ({producto.id}) está marcado como receta pero no tiene items asociados.")
            costo_calculado_ref = Decimal(0) # O podrías lanzar un error si esto no debería pasar
        else:
            # Si la relación es lazy='dynamic', necesitamos .all() para iterar
            # Si no es lazy='dynamic' (por defecto 'select'), podemos iterar directamente
            items_receta = producto.receta.items # Asumiendo que no es lazy='dynamic' por defecto
            if not items_receta:
                 print(f"WARN: Receta para producto {producto_id} no tiene items.")
                 costo_calculado_ref = Decimal(0)
            else:
                for item in items_receta:
                    if item.ingrediente_id is None:
                         print(f"WARN: Item de receta {item.id} no tiene ingrediente_id asociado.")
                         continue # Saltar este item

                    try:
                        # Recursión para obtener costo de referencia del ingrediente
                        costo_ingrediente_ref = calcular_costo_producto_referencia(
                            item.ingrediente_id,
                            visited.copy() # Pasar una COPIA del set para evitar interferencias entre ramas
                        )
                        porcentaje_item = Decimal(item.porcentaje) if item.porcentaje is not None else Decimal(0)
                        # Acumular costo ponderado
                        costo_calculado_ref += costo_ingrediente_ref * (porcentaje_item / Decimal(100))
                    except ValueError as e:
                        # Propagar error si un ingrediente no se encuentra o hay un ciclo más abajo
                        raise ValueError(f"Error calculando costo ref para ingrediente ID {item.ingrediente_id} en receta de '{producto.id}': {e}")
                    except Exception as e:
                        # Capturar otros errores inesperados en la recursión
                        print(f"ERROR inesperado calculando costo para ingrediente ID {item.ingrediente_id}")
                        traceback.print_exc()
                        raise Exception(f"Error inesperado calculando costo ingrediente {item.ingrediente_id}: {e}")


    visited.remove(producto_id) # Importante: Quitar al salir de la rama de recursión
    # Devolver con precisión adecuada (4 decimales es común para costos USD)
    return costo_calculado_ref.quantize(Decimal("0.0001"))

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
        "receta_id": producto.receta.id if producto.receta else None # Solo si la relación 'receta' existe
    }


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


@productos_bp.route('/obtener_todos', methods=['GET'])
def obtener_productos():
    """Obtiene una lista de todos los productos."""
    try:
        # Considerar añadir paginación para listas potencialmente largas
        # page = request.args.get('page', 1, type=int)
        # per_page = request.args.get('per_page', 20, type=int)
        # productos_paginados = Producto.query.order_by(Producto.nombre).paginate(page=page, per_page=per_page, error_out=False)
        # productos = productos_paginados.items
        # pagination_info = {...} # Añadir info de paginación a la respuesta
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
    """Actualiza los datos de un producto existente."""
    producto = db.session.get(Producto, producto_id)
    if not producto:
        return jsonify({"error": "Producto no encontrado"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "No se recibieron datos JSON en el payload"}), 400

    # Validar código interno único si se intenta cambiar
    nuevo_codigo = data.get('id')
    if nuevo_codigo and nuevo_codigo != producto.id:
        if Producto.query.filter(Producto.id != producto_id, Producto.id == nuevo_codigo).first():
            return jsonify({"error": f"El código interno '{nuevo_codigo}' ya está en uso por otro producto"}), 409 # Conflict

    try:
        # Actualizar campos básicos
        producto.id = data.get('id', producto.id)
        producto.nombre = data.get('nombre', producto.nombre)
        producto.unidad_venta = data.get('unidad_venta', producto.unidad_venta)
        producto.tipo_calculo = data.get('tipo_calculo', producto.tipo_calculo)
        producto.ref_calculo = data.get('ref_calculo', producto.ref_calculo)
        producto.ajusta_por_tc = data.get('ajusta_por_tc', producto.ajusta_por_tc)

        # Actualizar campos numéricos con validación
        if 'margen' in data:
             producto.margen = Decimal(str(data['margen'])) if data['margen'] is not None else None

        # Permitir actualizar costo manualmente SOLO si NO es receta
        if not producto.es_receta and 'costo_referencia_usd' in data:
             producto.costo_referencia_usd = Decimal(str(data['costo_referencia_usd'])) if data['costo_referencia_usd'] is not None else None
             # onupdate=datetime... en el modelo debería manejar la fecha,
             # pero se puede forzar si es necesario:
             # producto.fecha_actualizacion_costo = datetime.datetime.utcnow()

        # Nota: No se permite cambiar 'es_receta' directamente aquí.
        # Debe hacerse a través de los endpoints de recetas (crear/eliminar receta).

        db.session.commit()
        print(f"INFO: Producto actualizado: ID {producto_id}, Código: {producto.id}")
        return jsonify(producto_a_dict(producto))

    except (ValueError, TypeError, InvalidOperation) as e:
         db.session.rollback()
         print(f"ERROR: Datos numéricos inválidos al actualizar producto {producto_id} - {e}")
         return jsonify({"error": f"Error en los datos numéricos (margen, costo_referencia_usd): {e}"}), 400
    except Exception as e:
        db.session.rollback()
        print(f"ERROR: Excepción inesperada al actualizar producto {producto_id}")
        traceback.print_exc()
        return jsonify({"error": "Error interno del servidor al actualizar el producto"}), 500


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
@productos_bp.route('/calcular_precio/<int:product_id>', methods=['POST'])
def calculate_price(product_id):
    """
    Calcula el precio de venta final en ARS para un producto y cantidad dados.
    Payload: {"quantity": "12.5"}
    """
    print(f"\n--- INFO: POST /productos/{product_id}/calculate_price ---")
    producto = db.session.get(Producto, product_id)
    if not producto:
        return jsonify({"status": "error", "message": "Producto no encontrado"}), 404

    data = request.get_json()
    if not data or 'quantity' not in data:
         return jsonify({"status": "error", "message": "Falta 'quantity' en el payload"}), 400

    try:
        quantity_str = str(data['quantity']).strip()
        quantity_float = float(quantity_str.replace(',', '.'))
        if quantity_float <= 0:
            return jsonify({"status": "error", "message": "La cantidad debe ser positiva."}), 400
    except (ValueError, TypeError):
        return jsonify({"status": "error", "message": "Cantidad inválida."}), 400

    try:
        # 1. Calcular Costo Base en USD de Referencia
        costo_ref_usd = calcular_costo_producto_referencia(product_id)

        # 2. Obtener Tipo de Cambio correspondiente (Oficial/Empresa)
        nombre_tc_aplicar = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
        tipo_cambio = TipoCambio.query.filter_by(nombre=nombre_tc_aplicar).first()
        if not tipo_cambio or tipo_cambio.valor is None or tipo_cambio.valor <= 0:
            raise ValueError(f"Tipo de cambio '{nombre_tc_aplicar}' no válido para calcular precio.")

        # 3. Convertir Costo a ARS para Venta
        costo_final_venta_ars = (costo_ref_usd * tipo_cambio.valor) # Mantener Decimal aquí

        # 4. Obtener datos para fórmula de venta (margen, coeficiente)
        margen = producto.margen if producto.margen is not None else Decimal(0)
        margen_float = float(margen) # Convertir a float para el cálculo si es necesario
        tipo_calculo = producto.tipo_calculo
        ref_calculo_str = str(producto.ref_calculo) if producto.ref_calculo is not None else None
        unidad_venta = producto.unidad_venta or "N/A"

        # Validar datos necesarios para cálculo de precio
        if margen < 0 or margen >= 1: # Margen debe ser 0 <= margen < 1
             raise ValueError("Margen del producto inválido (debe ser entre 0 y 0.99...).")
        if not tipo_calculo or ref_calculo_str is None:
            raise ValueError("Faltan datos del producto para calcular coeficiente (tipo_calculo, ref_calculo).")

        # 5. Obtener Coeficiente de calculator.core
        coeficiente = obtener_coeficiente_por_rango(ref_calculo_str, quantity_str, tipo_calculo)
        print(f"--- DEBUG [calculate_price]: Coeficiente de tabla '{tipo_calculo}' para Qty '{quantity_str}', Ref '{ref_calculo_str}': {coeficiente}")

        if coeficiente is None:
            # Coeficiente no encontrado para esa combinación
            return jsonify({
                "status": "not_found",
                "reason": "coefficient_not_found",
                "message": f"No se encontró coeficiente en tabla '{tipo_calculo}' para la cantidad '{quantity_str}' y referencia '{ref_calculo_str}'."
            }), 404 # Not Found es apropiado aquí

        # 6. Calcular Precio de Venta Final
        # Usar floats para el cálculo final es común, pero asegura precisión suficiente
        denominador = 1.0 - margen_float
        if denominador == 0: # Evitar división por cero si margen es 1 (aunque validamos antes)
            raise ValueError("División por cero: Margen no puede ser 1.")

        precio_venta_unitario = round((float(costo_final_venta_ars) / denominador) * float(coeficiente), 2)
        precio_total_calculado = round(precio_venta_unitario * quantity_float, 2)

        # 7. Construir Respuesta Exitosa
        response_data = {
            "status": "success",
            "product_id_solicitado": product_id,
            "nombre_producto": producto.nombre,
            "cantidad_solicitada": quantity_float,
            "unidad_venta": unidad_venta,
            "costo_referencia_usd": float(costo_ref_usd),
            "tipo_cambio_aplicado": {
                "nombre": nombre_tc_aplicar,
                "valor": float(tipo_cambio.valor)
            },
            "costo_final_venta_ars": float(costo_final_venta_ars.quantize(Decimal("0.01"))), # Redondear ARS a 2 dec
            "margen_aplicado": margen_float,
            "tipo_calculo_usado": tipo_calculo,
            "referencia_interna_usada": ref_calculo_str,
            "coeficiente_aplicado": float(coeficiente),
            "precio_venta_unitario_ars": precio_venta_unitario,
            "precio_total_calculado_ars": precio_total_calculado
        }
        print(f"--- INFO [calculate_price]: Precio calculado para {producto.id}: {response_data}")
        return jsonify(response_data), 200

    except ValueError as e: # Errores controlados (TC no válido, margen inválido, etc.)
        print(f"ERROR [calculate_price]: ValueError para producto {product_id} - {e}")
        # Devolver 400 Bad Request si el problema son datos inválidos del producto o TC
        return jsonify({"status": "error", "message": f"Error al calcular precio: {e}"}), 400
    except Exception as e:
        # Errores inesperados
        print(f"ERROR [calculate_price]: Excepción inesperada para producto {product_id}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Error interno del servidor al calcular el precio."}), 500