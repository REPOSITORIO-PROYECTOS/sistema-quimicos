# app/blueprints/precios_especiales.py
from flask import Blueprint, request, jsonify, send_file
from sqlalchemy.orm import joinedload # Para cargar datos relacionados eficientemente
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
import traceback
import logging
import pandas as pd
import io
import csv
import unicodedata
import re

# --- Imports locales ---
from .. import db
from ..models import PrecioEspecialCliente, Cliente, Producto, TipoCambio
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES
from ..utils.math_utils import redondear_a_siguiente_decena_simplificado
# Importar función de redondeo si la necesitas
# from ..utils.cost_utils import redondear_decimal

# --- Blueprint ---
precios_especiales_bp = Blueprint('precios_especiales', __name__, url_prefix='/precios_especiales')

# Logger del módulo
logger = logging.getLogger(__name__)

# --- Helpers ---
def precio_especial_a_dict(precio_esp):
    """Serializa un objeto PrecioEspecialCliente a diccionario."""
    if not precio_esp: return None
    # Calcular dinámicamente el precio en ARS según la moneda original y el Tipo de Cambio 'Oficial'
    precio_computado = None
    tipo_cambio_actual = None
    try:
        precio_computado, tipo_cambio_actual = calcular_precio_ars(precio_esp)
    except Exception as e:
        logger.exception("[precio_especial_a_dict] error calculando precio ARS dinámico: %s", e)

    return {
        "id": precio_esp.id,
        "cliente_id": precio_esp.cliente_id,
        "cliente_nombre": precio_esp.cliente.nombre_razon_social if precio_esp.cliente else None,
        "producto_id": precio_esp.producto_id,
        "producto_nombre": precio_esp.producto.nombre if precio_esp.producto else None,
        # precio_unitario_fijo_ars ahora refleja el valor COMPUTADO en ARS al momento de la llamada
        "precio_unitario_fijo_ars": float(precio_computado) if precio_computado is not None else None,
        # Campos originales guardados en la BD
        "precio_unitario_fijo_ars_guardado": float(precio_esp.precio_unitario_fijo_ars) if precio_esp.precio_unitario_fijo_ars is not None else None,
        "moneda_original": precio_esp.moneda_original if hasattr(precio_esp, 'moneda_original') else None,
        "precio_original": float(precio_esp.precio_original) if hasattr(precio_esp, 'precio_original') and precio_esp.precio_original is not None else None,
        # Nuevos campos para cálculo dinámico de precios
        "usar_precio_base": bool(getattr(precio_esp, 'usar_precio_base', False)),
        "margen_sobre_base": float(precio_esp.margen_sobre_base) if getattr(precio_esp, 'margen_sobre_base', None) is not None else None,
        # Tipo de cambio usado para el cálculo actual (puede ser distinto del guardado)
        "tipo_cambio_usado": float(tipo_cambio_actual) if tipo_cambio_actual is not None else (float(precio_esp.tipo_cambio_usado) if hasattr(precio_esp, 'tipo_cambio_usado') and precio_esp.tipo_cambio_usado is not None else None),
        "activo": precio_esp.activo,
        "fecha_creacion": precio_esp.fecha_creacion.isoformat() if precio_esp.fecha_creacion else None,
        "fecha_modificacion": precio_esp.fecha_modificacion.isoformat() if precio_esp.fecha_modificacion else None,
    }


def calcular_precio_ars(precio_esp):
    """Devuelve una tupla (precio_en_ars: Decimal | None, tipo_cambio_usado: Decimal | None).

    Reglas:
    - Si `precio_esp.moneda_original` == 'USD' y `precio_esp.precio_original` está presente -> multiplicar por TipoCambio 'Oficial' actual.
    - Si `moneda_original` es 'ARS' o no existe `precio_original`, usar `precio_unitario_fijo_ars` guardado.
    - Si no hay información suficiente, devolver (None, None).
    """
    tipo_cambio_actual = None
    precio_ars = None
    try:
        # PRIORIDAD 1: Si la regla indica usar el precio base calculado del producto
        if getattr(precio_esp, 'usar_precio_base', False):
            # Importar localmente para evitar ciclos
            try:
                from .productos import calcular_costo_producto_referencia
            except ImportError:
                from ..blueprints.productos import calcular_costo_producto_referencia

            producto = precio_esp.producto or db.session.get(Producto, precio_esp.producto_id)
            if not producto:
                return (None, None)

            # Calcular costo unitario USD
            costo_unitario_usd = calcular_costo_producto_referencia(producto.id) or Decimal('0')
            
            # Obtener tipo de cambio apropiado
            nombre_tc = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
            tc_obj = TipoCambio.query.filter_by(nombre=nombre_tc).first()
            if not tc_obj or not tc_obj.valor:
                raise ValueError(f"Tipo de cambio '{nombre_tc}' no disponible")
            
            try:
                tipo_cambio_actual = Decimal(str(tc_obj.valor))
            except Exception:
                tipo_cambio_actual = Decimal(tc_obj.valor)

            # Convertir costo a ARS
            costo_unitario_ars = costo_unitario_usd * tipo_cambio_actual
            
            # Aplicar margen del producto para obtener precio base
            margen_producto = Decimal(str(producto.margen or '0.0'))
            if margen_producto >= Decimal('1'):
                raise ValueError(f"Margen del producto {producto.id} es >= 1, no se puede calcular precio base")
            
            precio_base_ars = costo_unitario_ars / (Decimal('1') - margen_producto)

            # Aplicar margen adicional si existe
            if getattr(precio_esp, 'margen_sobre_base', None) is not None:
                margen_sobre = Decimal(str(precio_esp.margen_sobre_base))
                precio_ars = precio_base_ars * (Decimal('1') + margen_sobre)
            else:
                precio_ars = precio_base_ars

            return (precio_ars, tipo_cambio_actual)

        # PRIORIDAD 2: Usar moneda original y precio original
        moneda = getattr(precio_esp, 'moneda_original', None) or 'ARS'
        moneda = str(moneda).upper()
        if moneda == 'USD' and getattr(precio_esp, 'precio_original', None) is not None:
            tc_obj = TipoCambio.query.filter_by(nombre='Oficial').first()
            if not tc_obj or not tc_obj.valor:
                raise ValueError("Tipo de Cambio 'Oficial' no disponible")
            try:
                tipo_cambio_actual = Decimal(str(tc_obj.valor))
            except Exception:
                tipo_cambio_actual = Decimal(tc_obj.valor)
            precio_ars = Decimal(precio_esp.precio_original) * tipo_cambio_actual
        else:
            # Valor guardado en ARS
            if getattr(precio_esp, 'precio_unitario_fijo_ars', None) is not None:
                precio_ars = Decimal(precio_esp.precio_unitario_fijo_ars)
            else:
                precio_ars = None
    except Exception:
        # Propagar excepción hacia el llamador si desea manejarlo; aquí retornamos None
        raise

    return (precio_ars, tipo_cambio_actual)


@precios_especiales_bp.route('/descargar_plantilla_precios', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'])
def descargar_plantilla_precios(current_user):
    """
    Genera y devuelve un archivo Excel (.xlsx) con dos hojas:
    - 'PLANTILLA': columnas requeridas y ejemplos de formato + instrucciones.
    - 'PRECIOS_ACTUALES': lista de precios especiales actualmente guardados (cliente, producto, precio en ARS).

    Esto facilita que el usuario descargue, corrija y vuelva a subir el archivo en el formato esperado.
    """
    try:
        # Hoja plantilla: columnas y ejemplos
        plantilla_cols = ['cliente', 'producto', 'precio', 'moneda']
        plantilla_ejemplo = [
            {'cliente': 'ACME S.A.', 'producto': 'Detergente 1L', 'precio': '1234.56', 'moneda': 'ARS'},
            {'cliente': 'ACME S.A.', 'producto': 'Shampoo 500ml', 'precio': '10.00', 'moneda': 'USD'},
            {'cliente': '', 'producto': '', 'precio': '', 'moneda': ''},
        ]
        df_plantilla = pd.DataFrame(plantilla_ejemplo, columns=plantilla_cols)

        # Hoja de instrucciones (una sola columna con texto multilínea)
        instrucciones = [
            'INSTRUCCIONES PARA LA PLANTILLA:',
            '- La primera hoja "PLANTILLA" contiene las columnas requeridas: cliente, producto, precio, moneda.',
            "- Si la moneda es 'USD', el sistema usará el Tipo de Cambio 'Oficial' para convertir a ARS al importar.",
            "- Para agregar o actualizar precios: incluye una fila por combinación cliente+producto. Si ya existe una regla, se actualizará el precio; si no existe, se creará.",
            "- Si un cliente tiene 2 precios especiales (por ejemplo para 2 presentaciones diferentes), deben ser dos filas con el mismo nombre de cliente y diferentes 'producto'.",
            "- Evita columnas adicionales. Mantén los nombres de columnas tal cual (no traduzcas).",
            "- Ejemplo: si cliente 'ACME' tiene dos precios especiales para el mismo producto con distinta presentación, carga dos filas con distinto texto en 'producto'.",
            "- Guarda el archivo como .xlsx y súbelo usando el endpoint /precios_especiales/cargar_csv (o desde la UI si está disponible).",
        ]
        df_instrucciones = pd.DataFrame({'Notas': instrucciones})

        # Hoja con precios actuales: incluir TODOS los clientes.
        # - Si el cliente tiene precios especiales, añadir una fila por cada precio.
        # - Si el cliente NO tiene precios especiales, añadir una sola fila con producto/precio/moneda vacíos.
        precios = []
        clientes_all = Cliente.query.order_by(Cliente.nombre_razon_social).all()
        for c in clientes_all:
            # obtener precios especiales del cliente (si los tiene)
            precios_cliente = db.session.query(PrecioEspecialCliente).options(
                joinedload(PrecioEspecialCliente.cliente),
                joinedload(PrecioEspecialCliente.producto)
            ).filter(PrecioEspecialCliente.cliente_id == c.id).all()

            if precios_cliente:
                for p in precios_cliente:
                    precios.append({
                        'cliente_id': p.cliente_id,
                        'cliente': p.cliente.nombre_razon_social if p.cliente else (c.nombre_razon_social if c else None),
                        'producto_id': p.producto_id,
                        'producto': p.producto.nombre if p.producto else None,
                        # precio en ARS (valor computado/guardado)
                        'precio_ars': float(p.precio_unitario_fijo_ars) if p.precio_unitario_fijo_ars is not None else None,
                        # preservar moneda_original y precio_original para trazabilidad
                        'moneda_original': p.moneda_original if hasattr(p, 'moneda_original') and p.moneda_original is not None else 'ARS',
                        'precio_original': float(p.precio_original) if hasattr(p, 'precio_original') and p.precio_original is not None else None,
                    })
            else:
                # Cliente sin precios especiales: una fila con producto/precio vacíos
                precios.append({
                    'cliente_id': c.id,
                    'cliente': c.nombre_razon_social,
                    'producto_id': None,
                    'producto': '',
                    'precio_ars': None,
                    'moneda_original': '',
                    'precio_original': None
                })

        # Ordenar por cliente nombre y producto para facilitar la revisión
        df_precios_actuales = pd.DataFrame(precios, columns=['cliente_id', 'cliente', 'producto_id', 'producto', 'precio_ars', 'moneda_original', 'precio_original'])
        df_precios_actuales.sort_values(by=['cliente', 'producto'], inplace=True)

        # Escribir a Excel en memoria
        output = io.BytesIO()
        try:
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df_plantilla.to_excel(writer, sheet_name='PLANTILLA', index=False)
                df_precios_actuales.to_excel(writer, sheet_name='PRECIOS_ACTUALES', index=False)
                df_instrucciones.to_excel(writer, sheet_name='INSTRUCCIONES', index=False)
        except Exception:
            # Fallback: intentar con xlsxwriter si openpyxl no está disponible
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                df_plantilla.to_excel(writer, sheet_name='PLANTILLA', index=False)
                df_precios_actuales.to_excel(writer, sheet_name='PRECIOS_ACTUALES', index=False)
                df_instrucciones.to_excel(writer, sheet_name='INSTRUCCIONES', index=False)

        output.seek(0)
        filename = 'plantilla_precios_especiales.xlsx'
        logger.info("[descargar_plantilla_precios] Usuario %s descargó plantilla/actuales", getattr(current_user, 'id', None))
        return send_file(output, as_attachment=True, download_name=filename, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    except Exception as e:
        logger.exception("ERROR [descargar_plantilla_precios]: %s", e)
        return jsonify({"error": "Error al generar el archivo Excel."}), 500

# --- Endpoints CRUD ---

@precios_especiales_bp.route('/crear', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN']) # O un rol 'GESTOR_PRECIOS'
def crear_precio_especial(current_user):
    """Crea una nueva regla de precio especial."""
    data = request.get_json()
    
    # Validar campos obligatorios - pero price es opcional si usar_precio_base=True
    if not data or 'cliente_id' not in data or 'producto_id' not in data:
        return jsonify({"error": "Faltan datos: cliente_id, producto_id"}), 400
    
    usar_precio_base = data.get('usar_precio_base', False)
    if not usar_precio_base and 'precio_unitario_fijo_ars' not in data:
        return jsonify({"error": "Faltan datos: precio_unitario_fijo_ars (o usar_precio_base=True)"}), 400

    cliente_id = data['cliente_id']
    producto_id = data['producto_id']
    precio_str = str(data.get('precio_unitario_fijo_ars', '')).strip() if data.get('precio_unitario_fijo_ars') is not None else ''
    activo = data.get('activo', True) # Default a activo
    
    # Nuevos campos para cálculo dinámico
    margen_sobre_base = data.get('margen_sobre_base')

    # Validar IDs
    if not isinstance(cliente_id, int) or not isinstance(producto_id, int):
         return jsonify({"error": "cliente_id y producto_id deben ser enteros"}), 400
    if not db.session.get(Cliente, cliente_id):
        return jsonify({"error": f"Cliente ID {cliente_id} no encontrado"}), 404
    if not db.session.get(Producto, producto_id):
        return jsonify({"error": f"Producto ID {producto_id} no encontrado"}), 404

    # Validar precio (solo si no usa precio base)
    precio_decimal = None
    if not usar_precio_base and precio_str:
        try:
            precio_decimal = Decimal(precio_str)
            if precio_decimal < 0: raise ValueError("Precio no puede ser negativo")
            # Podrías redondear aquí si quieres forzar una precisión
            # precio_decimal = redondear_decimal(precio_decimal, 4)
        except (InvalidOperation, ValueError) as e:
            return jsonify({"error": f"Precio unitario inválido: {e}"}), 400
    
    # Validar margen sobre base si se proporciona
    margen_sobre_base_decimal = None
    if margen_sobre_base is not None:
        try:
            margen_sobre_base_decimal = Decimal(str(margen_sobre_base))
            if margen_sobre_base_decimal < -1: # Permitir descuentos hasta -100%
                raise ValueError("Margen sobre base no puede ser menor a -1 (-100%)")
        except (InvalidOperation, ValueError) as e:
            return jsonify({"error": f"Margen sobre base inválido: {e}"}), 400

    # Verificar si ya existe (manejar UniqueConstraint)
    existente = PrecioEspecialCliente.query.filter_by(cliente_id=cliente_id, producto_id=producto_id).first()
    if existente:
        return jsonify({"error": f"Ya existe un precio especial para este cliente y producto (ID: {existente.id}). Use PUT para modificarlo."}), 409 # Conflict

    try:
        # Soportar moneda_original/precio_original opcionales en el payload
        moneda_original = data.get('moneda_original')
        precio_original_val = data.get('precio_original')

        tipo_cambio_usado = None
        # Si usar_precio_base=1 (margin-based), precio_unitario_fijo_ars debe ser 0
        # Si usar_precio_base=0 (fixed price), usar el precio proporcionado
        precio_unitario_guardado = Decimal('0') if usar_precio_base else precio_decimal

        # Si el cliente envía precio_original y moneda USD, calcular ARS usando TC 'Oficial'
        if moneda_original and str(moneda_original).upper() == 'USD' and precio_original_val is not None:
            try:
                precio_original_dec = Decimal(str(precio_original_val))
            except Exception:
                return jsonify({"error": "precio_original inválido"}), 400

            tc_obj = TipoCambio.query.filter_by(nombre='Oficial').first()
            if not tc_obj or not tc_obj.valor:
                return jsonify({"error": "Tipo de Cambio 'Oficial' no disponible para conversión"}), 500
            try:
                tc_val = Decimal(str(tc_obj.valor))
            except Exception:
                tc_val = Decimal(tc_obj.valor)
            tipo_cambio_usado = tc_val
            # Si usar_precio_base=1 (margin-based), precio_unitario_fijo_ars debe ser 0
            # Si usar_precio_base=0 (fixed price), usar el precio convertido
            precio_unitario_guardado = Decimal('0') if usar_precio_base else (precio_original_dec * tc_val)

            nuevo_precio = PrecioEspecialCliente(
                cliente_id=cliente_id,
                producto_id=producto_id,
                precio_unitario_fijo_ars=precio_unitario_guardado,
                moneda_original=str(moneda_original).upper(),
                precio_original=precio_original_dec,
                tipo_cambio_usado=tc_val,
                usar_precio_base=usar_precio_base,
                margen_sobre_base=margen_sobre_base_decimal,
                activo=activo
            )
        else:
            # Guardar moneda_original si viene (por ejemplo 'ARS') y precio_original opcional
            moneda_saved = str(moneda_original).upper() if moneda_original else 'ARS'
            precio_original_dec = None
            if precio_original_val is not None:
                try:
                    precio_original_dec = Decimal(str(precio_original_val))
                except Exception:
                    precio_original_dec = None

            nuevo_precio = PrecioEspecialCliente(
                cliente_id=cliente_id,
                producto_id=producto_id,
                precio_unitario_fijo_ars=precio_unitario_guardado,
                moneda_original=moneda_saved,
                precio_original=precio_original_dec,
                tipo_cambio_usado=(tipo_cambio_usado if tipo_cambio_usado is not None else None),
                usar_precio_base=usar_precio_base,
                margen_sobre_base=margen_sobre_base_decimal,
                activo=activo
            )
        db.session.add(nuevo_precio)
        db.session.commit()

        # Cargar relaciones para la respuesta
        precio_cargado = db.session.query(PrecioEspecialCliente).options(
            joinedload(PrecioEspecialCliente.cliente),
            joinedload(PrecioEspecialCliente.producto)
        ).get(nuevo_precio.id)

        return jsonify(precio_especial_a_dict(precio_cargado)), 201

    except Exception as e:
        db.session.rollback()
        # Podría ser un error de la UniqueConstraint si hubo una condición de carrera
        if "uq_cliente_producto_precio_especial" in str(e):
            return jsonify({"error": "Ya existe un precio especial para este cliente y producto."}), 409
        logger.exception("ERROR [crear_precio_especial]: Excepción al crear precio especial")
        return jsonify({"error": "Error interno al crear el precio especial"}), 500


@precios_especiales_bp.route('/obtener-todos', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN']) # O 'VENTAS', 'USER'?
def listar_precios_especiales(current_user):
    """Lista los precios especiales con filtros opcionales."""
    try:
        query = PrecioEspecialCliente.query.options(
            joinedload(PrecioEspecialCliente.cliente), # Cargar datos relacionados
            joinedload(PrecioEspecialCliente.producto)
        )

        # Filtros
        cliente_id_filtro = request.args.get('cliente_id', type=int)
        if cliente_id_filtro: query = query.filter(PrecioEspecialCliente.cliente_id == cliente_id_filtro)

        producto_id_filtro = request.args.get('producto_id', type=int)
        if producto_id_filtro: query = query.filter(PrecioEspecialCliente.producto_id == producto_id_filtro)

        activo_filtro = request.args.get('activo') # Viene como string 'true'/'false'
        if activo_filtro is not None:
            activo_bool = activo_filtro.lower() == 'true'
            query = query.filter(PrecioEspecialCliente.activo == activo_bool)

        # Orden
        query = query.order_by(PrecioEspecialCliente.cliente_id, PrecioEspecialCliente.producto_id) # O por fecha

        # Paginación
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        paginated_precios = query.paginate(page=page, per_page=per_page, error_out=False)
        precios_db = paginated_precios.items

        precios_list = [precio_especial_a_dict(p) for p in precios_db]

        return jsonify({
            "precios_especiales": precios_list,
            "pagination": {
                "total_items": paginated_precios.total,
                "total_pages": paginated_precios.pages,
                "current_page": page,
                "per_page": per_page,
                "has_next": paginated_precios.has_next,
                "has_prev": paginated_precios.has_prev
            }
        })
    except Exception as e:
        logger.exception("ERROR [listar_precios_especiales]: Excepción al listar precios especiales")
        return jsonify({"error": "Error interno al listar precios especiales"}), 500


@precios_especiales_bp.route('/obtener-por-cliente/<int:client_id>', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['VENTAS_PEDIDOS'])
def obtener_precio_especial(current_user, client_id):
    """Obtiene todos los precios especiales para un cliente por su ID.

    Nota: devuelve una lista vacía (200) si no hay precios, en lugar de 404, para
    facilitar el consumo desde UI que espera array.
    """
    precios_esp = db.session.query(PrecioEspecialCliente).options(
        joinedload(PrecioEspecialCliente.cliente),
        joinedload(PrecioEspecialCliente.producto)
    ).filter(PrecioEspecialCliente.cliente_id == client_id).all()

    if not precios_esp:
        return jsonify([]), 200
    return jsonify([precio_especial_a_dict(p) for p in precios_esp])


@precios_especiales_bp.route('/editar/<int:precio_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['VENTAS_PEDIDOS'])
def actualizar_precio_especial(current_user, precio_id):
    """Actualiza un precio especial existente (precio o estado activo)."""
    precio_esp = db.session.get(PrecioEspecialCliente, precio_id)
    if not precio_esp:
        return jsonify({"error": "Precio especial no encontrado"}), 404

    data = request.get_json()
    if not data: return jsonify({"error": "Payload vacío"}), 400

    updated = False
    try:
        if 'precio_unitario_fijo_ars' in data:
            # Solo actualizar precio_unitario_fijo_ars si no estamos usando precio base (margin-based)
            if not getattr(precio_esp, 'usar_precio_base', False):
                precio_str = str(data['precio_unitario_fijo_ars']).strip()
                try:
                    precio_decimal = Decimal(precio_str)
                    if precio_decimal < 0: raise ValueError("Precio no puede ser negativo")
                    # precio_decimal = redondear_decimal(precio_decimal, 4) # Opcional redondear
                    if precio_esp.precio_unitario_fijo_ars != precio_decimal:
                        precio_esp.precio_unitario_fijo_ars = precio_decimal
                        updated = True
                except (InvalidOperation, ValueError) as e:
                    return jsonify({"error": f"Precio unitario inválido: {e}"}), 400
            else:
                # Si usar_precio_base=True, precio_unitario_fijo_ars debe ser 0
                if precio_esp.precio_unitario_fijo_ars != Decimal('0'):
                    precio_esp.precio_unitario_fijo_ars = Decimal('0')
                    updated = True

        if 'activo' in data:
            if not isinstance(data['activo'], bool):
                return jsonify({"error": "'activo' debe ser un booleano (true/false)"}), 400
            if precio_esp.activo != data['activo']:
                precio_esp.activo = data['activo']
                updated = True

        # Manejar nuevos campos para cálculo dinámico
        if 'usar_precio_base' in data:
            if not isinstance(data['usar_precio_base'], bool):
                return jsonify({"error": "'usar_precio_base' debe ser un booleano (true/false)"}), 400
            if getattr(precio_esp, 'usar_precio_base', False) != data['usar_precio_base']:
                precio_esp.usar_precio_base = data['usar_precio_base']
                # Si cambiamos a usar_precio_base=True (margin-based), precio_unitario_fijo_ars debe ser 0
                if data['usar_precio_base']:
                    precio_esp.precio_unitario_fijo_ars = Decimal('0')
                updated = True

        if 'margen_sobre_base' in data:
            margen_val = data['margen_sobre_base']
            if margen_val is not None:
                try:
                    margen_decimal = Decimal(str(margen_val))
                    if margen_decimal < -1: # Permitir descuentos hasta -100%
                        raise ValueError("Margen sobre base no puede ser menor a -1 (-100%)")
                    if getattr(precio_esp, 'margen_sobre_base', None) != margen_decimal:
                        precio_esp.margen_sobre_base = margen_decimal
                        updated = True
                except (InvalidOperation, ValueError) as e:
                    return jsonify({"error": f"Margen sobre base inválido: {e}"}), 400
            else:
                # Permitir borrar el margen
                if getattr(precio_esp, 'margen_sobre_base', None) is not None:
                    precio_esp.margen_sobre_base = None
                    updated = True

        # Soportar actualización de moneda_original / precio_original
        if 'moneda_original' in data or 'precio_original' in data or 'precio_unitario_fijo_ars' in data:
            moneda_in = data.get('moneda_original')
            precio_original_in = data.get('precio_original')
            precio_unitario_in = data.get('precio_unitario_fijo_ars') if 'precio_unitario_fijo_ars' in data else None

            if moneda_in is not None:
                moneda_in_up = str(moneda_in).upper()
            else:
                moneda_in_up = getattr(precio_esp, 'moneda_original', None)

            precio_original_dec = None
            if precio_original_in is not None:
                try:
                    precio_original_dec = Decimal(str(precio_original_in))
                except Exception:
                    return jsonify({"error": "precio_original inválido"}), 400

            precio_unitario_dec = None
            if precio_unitario_in is not None:
                try:
                    precio_unitario_dec = Decimal(str(precio_unitario_in))
                except Exception:
                    return jsonify({"error": "precio_unitario_fijo_ars inválido"}), 400

            # Obtener TC si es necesario
            tc_val = None
            if moneda_in_up == 'USD' or (precio_original_dec is not None and getattr(precio_esp, 'moneda_original', None) == 'USD'):
                tc_obj = TipoCambio.query.filter_by(nombre='Oficial').first()
                if not tc_obj or not tc_obj.valor:
                    # No es crítico si no necesitamos conversión; solo cuando requiramos calcular
                    logger.warning("Tipo de Cambio 'Oficial' no disponible al actualizar precio especial ID %s", precio_id)
                    tc_val = None
                else:
                    try:
                        tc_val = Decimal(str(tc_obj.valor))
                    except Exception:
                        tc_val = Decimal(tc_obj.valor)

            # Caso A: moneda USD y recibimos precio_original -> recalcular ARS
            if moneda_in_up == 'USD' and precio_original_dec is not None:
                if not tc_val:
                    return jsonify({"error": "Tipo de Cambio 'Oficial' no disponible para conversión"}), 500
                nueva_ars = precio_original_dec * tc_val
                if precio_esp.precio_unitario_fijo_ars != nueva_ars:
                    precio_esp.precio_unitario_fijo_ars = nueva_ars
                    updated = True
                precio_esp.tipo_cambio_usado = tc_val
                precio_esp.moneda_original = 'USD'
                precio_esp.precio_original = precio_original_dec
                updated = True
            # Caso B: moneda USD y recibimos solo precio_unitario_fijo_ars (ARS) -> inferir precio_original = ARS / TC
            elif moneda_in_up == 'USD' and precio_unitario_dec is not None:
                if not tc_val:
                    return jsonify({"error": "Tipo de Cambio 'Oficial' no disponible para inferir precio_original"}), 500
                try:
                    inferred_original = (precio_unitario_dec / tc_val).quantize(Decimal('0.0001'))
                except Exception:
                    inferred_original = precio_unitario_dec / tc_val
                # Actualizar campos
                if precio_esp.precio_unitario_fijo_ars != precio_unitario_dec:
                    precio_esp.precio_unitario_fijo_ars = precio_unitario_dec
                    updated = True
                precio_esp.tipo_cambio_usado = tc_val
                precio_esp.moneda_original = 'USD'
                precio_esp.precio_original = inferred_original
                updated = True
            else:
                # Otros casos: actualizar moneda y/o precio_original/ARS según se reciba
                if moneda_in is not None:
                    precio_esp.moneda_original = moneda_in_up
                    updated = True
                if precio_original_dec is not None:
                    precio_esp.precio_original = precio_original_dec
                    # Si no se pasó precio_unitario_fijo_ars explícitamente, sincronizarlo con precio_original
                    if precio_unitario_dec is None:
                        if precio_esp.precio_unitario_fijo_ars != precio_original_dec:
                            precio_esp.precio_unitario_fijo_ars = precio_original_dec
                            updated = True
                    updated = True
                if precio_unitario_dec is not None:
                    if precio_esp.precio_unitario_fijo_ars != precio_unitario_dec:
                        precio_esp.precio_unitario_fijo_ars = precio_unitario_dec
                        updated = True

        if updated:
            db.session.commit()
            # Recargar datos para la respuesta
            precio_cargado = db.session.query(PrecioEspecialCliente).options(
                joinedload(PrecioEspecialCliente.cliente),
                joinedload(PrecioEspecialCliente.producto)
            ).get(precio_id)
            return jsonify(precio_especial_a_dict(precio_cargado))
        else:
            return jsonify({"message": "No se realizaron cambios."}), 200 # OK, pero sin cambios

    except Exception as e:
        db.session.rollback()
        logger.exception("ERROR [actualizar_precio_especial]: Excepción al actualizar precio especial")
        return jsonify({"error": "Error interno al actualizar el precio especial"}), 500


@precios_especiales_bp.route('/eliminar/<int:precio_id>', methods=['DELETE'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['VENTAS_PEDIDOS'])
def eliminar_precio_especial(current_user, precio_id):
    """Elimina una regla de precio especial."""
    precio_esp = db.session.get(PrecioEspecialCliente, precio_id)
    if not precio_esp:
        return jsonify({"error": "Precio especial no encontrado"}), 404

    try:
        db.session.delete(precio_esp)
        db.session.commit()
        return jsonify({"message": f"Precio especial ID {precio_id} eliminado correctamente."}), 200 # O 204 No Content
    except Exception as e:
        db.session.rollback()
        logger.exception("ERROR [eliminar_precio_especial]: Excepción al eliminar precio especial")
        return jsonify({"error": "Error interno al eliminar el precio especial"}), 500
    
@precios_especiales_bp.route('/test-calculo-dinamico/<int:precio_id>', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'])
def test_calculo_dinamico(current_user, precio_id):
    """Endpoint de prueba para verificar el cálculo dinámico de precios especiales."""
    precio_esp = db.session.query(PrecioEspecialCliente).options(
        joinedload(PrecioEspecialCliente.cliente),
        joinedload(PrecioEspecialCliente.producto)
    ).get(precio_id)
    
    if not precio_esp:
        return jsonify({"error": "Precio especial no encontrado"}), 404

    try:
        # Calcular precio usando la función existing
        precio_ars, tipo_cambio = calcular_precio_ars(precio_esp)
        
        # Obtener detalles del producto para comparación
        producto = precio_esp.producto
        if producto:
            try:
                from .productos import calcular_costo_producto_referencia
            except ImportError:
                from ..blueprints.productos import calcular_costo_producto_referencia
                
            costo_usd = calcular_costo_producto_referencia(producto.id) or Decimal('0')
            
            # Obtener tipo de cambio para el producto
            nombre_tc = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
            tc_obj = TipoCambio.query.filter_by(nombre=nombre_tc).first()
            tc_producto = Decimal(str(tc_obj.valor)) if tc_obj and tc_obj.valor else None
            
            costo_ars = costo_usd * tc_producto if tc_producto else None
            margen_producto = Decimal(str(producto.margen or '0.0'))
            precio_base_ars = costo_ars / (Decimal('1') - margen_producto) if costo_ars and margen_producto < Decimal('1') else None
        else:
            costo_usd = costo_ars = precio_base_ars = tc_producto = margen_producto = None

        result = {
            "precio_especial_id": precio_id,
            "cliente": precio_esp.cliente.nombre_razon_social if precio_esp.cliente else None,
            "producto": precio_esp.producto.nombre if precio_esp.producto else None,
            "usar_precio_base": bool(getattr(precio_esp, 'usar_precio_base', False)),
            "margen_sobre_base": float(precio_esp.margen_sobre_base) if getattr(precio_esp, 'margen_sobre_base', None) is not None else None,
            "calculos": {
                "precio_final_ars": float(precio_ars) if precio_ars else None,
                "tipo_cambio_usado": float(tipo_cambio) if tipo_cambio else None,
                "costo_unitario_usd": float(costo_usd) if costo_usd else None,
                "costo_unitario_ars": float(costo_ars) if costo_ars else None,
                "precio_base_ars": float(precio_base_ars) if precio_base_ars else None,
                "margen_producto": float(margen_producto) if margen_producto else None,
                "tipo_cambio_producto": float(tc_producto) if tc_producto else None
            },
            "campos_guardados": {
                "precio_unitario_fijo_ars": float(precio_esp.precio_unitario_fijo_ars) if precio_esp.precio_unitario_fijo_ars else None,
                "moneda_original": precio_esp.moneda_original if hasattr(precio_esp, 'moneda_original') else None,
                "precio_original": float(precio_esp.precio_original) if hasattr(precio_esp, 'precio_original') and precio_esp.precio_original else None
            }
        }
        
        return jsonify(result)
        
    except Exception as e:
        logger.exception("Error en test_calculo_dinamico")
        return jsonify({
            "error": str(e),
            "precio_especial_id": precio_id,
            "usar_precio_base": bool(getattr(precio_esp, 'usar_precio_base', False)),
            "margen_sobre_base": float(precio_esp.margen_sobre_base) if getattr(precio_esp, 'margen_sobre_base', None) is not None else None
        }), 500


@precios_especiales_bp.route('/calcular-precio-preview/<int:producto_id>', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'])
def calcular_precio_preview(current_user, producto_id):
    """
    Obtiene información del producto y calcula el precio base para preview en el frontend.
    Útil para mostrar el margen del producto y calcular precios dinámicamente.
    """
    try:
        # Obtener margen adicional desde query params
        margen_adicional = request.args.get('margen_adicional', type=float)
        
        # Obtener producto
        producto = db.session.get(Producto, producto_id)
        if not producto:
            return jsonify({"error": f"Producto ID {producto_id} no encontrado"}), 404
        
        # Importar función de cálculo de costo
        try:
            from .productos import calcular_costo_producto_referencia
        except ImportError:
            from ..blueprints.productos import calcular_costo_producto_referencia
        
        # Calcular costo unitario USD
        costo_unitario_usd = calcular_costo_producto_referencia(producto.id) or Decimal('0')
        
        # Obtener tipo de cambio apropiado
        nombre_tc = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
        tc_obj = TipoCambio.query.filter_by(nombre=nombre_tc).first()
        if not tc_obj or not tc_obj.valor:
            return jsonify({"error": f"Tipo de cambio '{nombre_tc}' no disponible"}), 500
        
        tipo_cambio_actual = Decimal(str(tc_obj.valor))
        
        # Convertir costo a ARS
        costo_unitario_ars = costo_unitario_usd * tipo_cambio_actual
        
        # Calcular precio base con margen del producto
        margen_producto = Decimal(str(producto.margen or '0.0'))
        if margen_producto >= Decimal('1'):
            return jsonify({"error": f"Margen del producto es >= 100%, no se puede calcular precio base"}), 400
        
        precio_base_ars = costo_unitario_ars / (Decimal('1') - margen_producto)
        
        # Calcular precio con margen adicional si se proporciona
        precio_con_margen = precio_base_ars
        if margen_adicional is not None:
            margen_adicional_decimal = Decimal(str(margen_adicional))
            precio_con_margen = precio_base_ars * (Decimal('1') + margen_adicional_decimal)
        
        # Preparar respuesta
        response = {
            "producto": {
                "id": producto.id,
                "nombre": producto.nombre,
                "margen_producto": float(margen_producto),
                "margen_producto_porcentaje": float(margen_producto * 100),
                "ajusta_por_tc": producto.ajusta_por_tc,
                "tipo_cambio_usado": nombre_tc
            },
            "calculos": {
                "costo_unitario_usd": float(costo_unitario_usd),
                "costo_unitario_ars": float(costo_unitario_ars),
                "tipo_cambio_actual": float(tipo_cambio_actual),
                "precio_base_ars": float(precio_base_ars),
                "precio_con_margen_ars": float(precio_con_margen) if margen_adicional is not None else None,
                "margen_adicional_aplicado": margen_adicional,
                "margen_adicional_porcentaje": margen_adicional * 100 if margen_adicional is not None else None
            },
            "comparacion": {
                "diferencia_ars": float(precio_con_margen - precio_base_ars) if margen_adicional is not None else 0,
                "porcentaje_total": float((precio_con_margen / precio_base_ars - 1) * 100) if margen_adicional is not None else 0
            }
        }
        
        return jsonify(response)
        
    except Exception as e:
        logger.exception("Error en calcular_precio_preview")
        return jsonify({"error": str(e)}), 500


@precios_especiales_bp.route('/actualizar-global', methods=['POST','PUT'])
@token_required
@roles_required(ROLES['ADMIN'])
def actualizar_precios_masivamente(current_user):
    """
    Actualiza TODOS los precios especiales activos aplicando un ajuste porcentual.
    """
    data = request.get_json()

    # --- 1. Validación del Payload (sin cambios) ---
    if not data or 'porcentaje' not in data or 'direccion' not in data:
        return jsonify({"error": "Faltan datos requeridos: 'porcentaje' y 'direccion'."}), 400
    
    porcentaje_str = str(data['porcentaje']).strip()
    direccion = data['direccion'].lower()

    if direccion not in ['subida', 'bajada']:
        return jsonify({"error": "El campo 'direccion' debe ser 'subida' o 'bajada'."}), 400
    try:
        porcentaje_decimal = Decimal(porcentaje_str)
        if porcentaje_decimal < 0:
            raise ValueError("El porcentaje no puede ser negativo.")
    except (InvalidOperation, ValueError):
        return jsonify({"error": "El 'porcentaje' debe ser un número válido y no negativo."}), 400

    # --- 2. Preparación del multiplicador (CORREGIDO) ---
    factor_porcentual = porcentaje_decimal / Decimal('100')
    
    if direccion == 'bajada':
        if factor_porcentual >= 1: # No se puede bajar 100% o más
            return jsonify({"error": "Un ajuste de bajada del 100% o más no es posible."}), 400
        # Fórmula correcta para descuento: Precio * (1 - X/100)
        factor_multiplicador = Decimal('1') - factor_porcentual
    else: # subida
        # Fórmula correcta para aumento: Precio * (1 + X/100)
        factor_multiplicador = Decimal('1') + factor_porcentual
        
    try:
        # --- 3. Consulta y Actualización (CON LÓGICA DE REDONDEO CONDICIONAL) ---
        precios_a_actualizar = PrecioEspecialCliente.query.filter_by(activo=True).all()

        if not precios_a_actualizar:
            return jsonify({"message": "No hay precios especiales activos para actualizar."}), 200

        updated_count = 0
        for precio_esp in precios_a_actualizar:
            if precio_esp.precio_unitario_fijo_ars is not None and precio_esp.precio_unitario_fijo_ars > 0:
                precio_original = precio_esp.precio_unitario_fijo_ars
                precio_calculado = precio_original * factor_multiplicador
                
                # --- LÓGICA DE REDONDEO MEJORADA ---
                precio_final = None
                aviso_redondeo = ""

                if direccion == 'subida':
                    # Para subidas, sí aplicamos el redondeo a la siguiente decena.
                    precio_final, _ = redondear_a_siguiente_decena_simplificado(precio_calculado)
                    aviso_redondeo = "Todos los precios fueron redondeados a la siguiente decena."
                else: # direccion == 'bajada'
                    # Para bajadas, simplemente redondeamos al centavo más cercano.
                    # Redondear hacia arriba iría en contra del descuento.
                    precio_final = precio_calculado.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                    aviso_redondeo = "Los precios fueron ajustados al centavo más cercano."

                precio_esp.precio_unitario_fijo_ars = precio_final
                updated_count += 1
        
        # --- 4. Confirmación y Respuesta ---
        if updated_count > 0:
            db.session.commit()
            return jsonify({
                "message": "Actualización masiva completada exitosamente.",
                "total_precios_actualizados": updated_count,
                "porcentaje_ajuste": f"{porcentaje_decimal}%",
                "direccion": direccion,
                "aviso": aviso_redondeo
            }), 200
        else:
            return jsonify({"message": "No se realizaron cambios."}), 200

    except Exception as e:
        db.session.rollback()
        logger.exception("ERROR [actualizar_precios_masivamente]: Excepción durante actualización masiva")
        return jsonify({"error": "Error interno durante la actualización masiva."}), 500

 
    
@precios_especiales_bp.route('/cargar_csv', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'])
def cargar_precios_desde_csv(current_user):
    """
    [VERSIÓN CON LÓGICA DE TC SIMPLIFICADA]
    Crea/actualiza precios masivamente desde un CSV. Si la moneda es 'USD', siempre usa el TC Oficial.
    Detecta el delimitador y procesa todas las filas válidas, informando errores.
    """
    if 'archivo_precios' not in request.files:
        return jsonify({"error": "No se encontró el archivo. La clave debe ser 'archivo_precios'."}), 400
    
    file = request.files['archivo_precios']
    if file.filename == '':
        return jsonify({"error": "No se seleccionó ningún archivo."}), 400

    filename_lower = file.filename.lower()
    is_excel = filename_lower.endswith('.xls') or filename_lower.endswith('.xlsx')
    is_csv = filename_lower.endswith('.csv')
    if not (is_csv or is_excel):
        return jsonify({"error": "El archivo debe tener la extensión .csv, .xls o .xlsx"}), 400

    try:
        # --- 1. LECTURA Y DETECCIÓN DE DELIMITADOR ---
        contenido_bytes = file.stream.read()
        if not contenido_bytes:
            return jsonify({"error": "El archivo está vacío."}), 400

        # Manejar BOM y distintas codificaciones comunes: intentar varias codificaciones
        def try_decode_bytes(b: bytes) -> str:
            encodings_to_try = ['utf-8-sig', 'utf-8', 'cp1252', 'latin-1']
            for enc in encodings_to_try:
                try:
                    s = b.decode(enc)
                    logger.debug("[cargar_csv] decoded bytes using encoding: %s", enc)
                    return s
                except Exception:
                    continue
            # Fallback seguro: decodificar con reemplazo para no romper el endpoint
            try:
                return b.decode('utf-8', errors='replace')
            except Exception:
                return b.decode('latin-1', errors='replace')

        contenido_str = try_decode_bytes(contenido_bytes)

        # Mejor detección del delimitador: intentamos sniff sobre una porción razonable
        posibles_delimitadores = [',', ';', '\t']
        delimitador_detectado = None
        try:
            sample = '\n'.join(contenido_str.splitlines()[:10])
            dialect = csv.Sniffer().sniff(sample, delimiters=''.join(posibles_delimitadores))
            delimitador_detectado = dialect.delimiter
        except csv.Error:
            # Fallback: elegir el delimitador que aparece más frecuentemente en la primera línea
            first_line = contenido_str.splitlines()[0] if contenido_str.splitlines() else ''
            counts = {d: first_line.count(d) for d in posibles_delimitadores}
            # pick the delimiter with highest count, default to comma
            delimitador_detectado = max(counts, key=counts.get) if any(counts.values()) else ','

        # --- 2. LECTURA CON PANDAS ---
        if is_excel:
            # Leer Excel: preferimos la hoja PRECIOS_ACTUALES si existe, si no PLANTILLA, si no la primera
            excel_io = io.BytesIO(contenido_bytes)
            try:
                xls = pd.ExcelFile(excel_io)
            except Exception as e:
                logger.exception("Error al leer archivo Excel: %s", e)
                return jsonify({"error": "Error al leer archivo Excel."}), 400

            sheet_to_use = None
            for candidate in ['PRECIOS_ACTUALES', 'PRECIOS_ACTUALES'.lower(), 'PLANTILLA', 'PLANTILLA'.lower()]:
                if candidate in xls.sheet_names:
                    sheet_to_use = candidate
                    break
            if sheet_to_use is None:
                sheet_to_use = xls.sheet_names[0]

            df = pd.read_excel(excel_io, sheet_name=sheet_to_use, dtype=str)
        else:
            df = pd.read_csv(
                io.StringIO(contenido_str),
                sep=delimitador_detectado,
                keep_default_na=False,
                dtype=str,
                engine='python'
            )

        # Helpers para normalizar cabeceras, claves y parsing de precio
        def normalize_text(s: str) -> str:
            if s is None:
                return ''
            s2 = str(s).strip().lower()
            # Remover tildes/diacríticos
            s2 = ''.join(ch for ch in unicodedata.normalize('NFKD', s2) if not unicodedata.combining(ch))
            # Remover caracteres no alfanuméricos salvo espacio
            s2 = re.sub(r'[^a-z0-9 ]+', '', s2)
            # Colapsar espacios
            s2 = re.sub(r'\s+', ' ', s2).strip()
            return s2

        # Mapeos de variantes de nombres de columna a nombre canónico
        column_variants = {
            'cliente': ['cliente', 'nombre', 'nombre razon social', 'razon social', 'razon_social', 'cliente nombre', 'cliente_nombre', 'nombre_cliente', 'customer', 'customer name', 'customer_name'],
            'producto': ['producto', 'product', 'producto nombre', 'producto_nombre', 'nombre producto', 'item', 'articulo', 'articulo nombre'],
            'precio': ['precio', 'price', 'precio unitario', 'precio_unitario', 'precio_unitario_fijo_ars', 'importe', 'valor'],
            'moneda': ['moneda', 'currency', 'divisa', 'moneda codigo', 'moneda_codigo']
        }

        # Aceptar columnas ID si están presentes en Excel export (cliente_id, producto_id)
        column_variants['cliente_id'] = ['cliente_id', 'cliente id', 'client_id', 'id cliente']
        column_variants['producto_id'] = ['producto_id', 'producto id', 'product_id', 'id producto']

        def find_column(df_columns, targets):
            cols_norm = {normalize_text(c): c for c in df_columns}
            for t in targets:
                t_norm = normalize_text(t)
                if t_norm in cols_norm:
                    return cols_norm[t_norm]
            # fallback: try exact contains
            for norm, orig in cols_norm.items():
                for t in targets:
                    if normalize_text(t) in norm:
                        return orig
            return None

        # Determinar columnas reales en el CSV/Excel
        cliente_col = find_column(df.columns, column_variants['cliente'])
        producto_col = find_column(df.columns, column_variants['producto'])
        precio_col = find_column(df.columns, column_variants['precio'])
        moneda_col = find_column(df.columns, column_variants['moneda'])
        cliente_id_col = find_column(df.columns, column_variants.get('cliente_id', []))
        producto_id_col = find_column(df.columns, column_variants.get('producto_id', []))

        if precio_col is None or (cliente_col is None and cliente_id_col is None) or (producto_col is None and producto_id_col is None):
            missing = []
            if cliente_col is None and cliente_id_col is None: missing.append('Cliente o cliente_id')
            if producto_col is None and producto_id_col is None: missing.append('Producto o producto_id')
            if precio_col is None: missing.append('Precio')
            return jsonify({"error": f"El CSV debe contener las columnas (o variantes) requeridas: {', '.join(missing)}"}), 400

        # Normalizar diccionarios de búsqueda de cliente/producto (más tolerante)
        def normalize_key_name(name: str) -> str:
            return normalize_text(str(name or ''))

        clientes_db = {normalize_key_name(c.nombre_razon_social): c for c in Cliente.query.all()}
        productos_db = {normalize_key_name(p.nombre): p for p in Producto.query.all()}

        # --- 3. PREPARACIÓN DE DATOS (CACHÉ) ---
        tc_oficial_obj = TipoCambio.query.filter_by(nombre='Oficial').first()
        if not tc_oficial_obj or not tc_oficial_obj.valor or tc_oficial_obj.valor <= 0:
            return jsonify({"error": "El Tipo de Cambio 'Oficial' no está configurado o no es válido."}), 500
        try:
            # Asegurarnos de que el valor del TC sea Decimal para evitar mezclar float/Decimal
            valor_dolar_oficial = Decimal(str(tc_oficial_obj.valor))
        except Exception:
            logger.exception("Tipo de cambio 'Oficial' no convertible a Decimal: %s", tc_oficial_obj.valor)
            return jsonify({"error": "Tipo de cambio 'Oficial' inválido."}), 500

        # clientes_db y productos_db fueron creados arriba con claves normalizadas (normalize_key_name)
        precios_existentes = {(pe.cliente_id, pe.producto_id): pe for pe in PrecioEspecialCliente.query.all()}

        # --- 4. PROCESAMIENTO DE FILAS ---
        registros_creados = 0
        registros_actualizados = 0
        filas_fallidas = []
        acciones_por_fila = []

        def registrar_error(linea_num, cliente_raw, producto_raw, motivo):
            filas_fallidas.append({
                "linea": linea_num,
                "cliente": cliente_raw,
                "producto": producto_raw,
                "motivo": motivo
            })

        # Función robusta para parsear precios con variantes (ej: "$1.234,56", "1,234.56", "1234.56", "1234,56")
        def parse_price_to_decimal(raw: str):
            if raw is None:
                raise InvalidOperation("Precio vacío")
            s = str(raw).strip()
            if s == '':
                raise InvalidOperation("Precio vacío")
            # Remover símbolos de moneda comunes
            s = re.sub(r'[\$€£]', '', s)
            # Remover espacios y proteger guiones
            s = s.replace('\u00A0', '').replace(' ', '')
            # Si tiene coma y punto, inferir formato: si la última coma está después del último punto -> comma decimal
            if ',' in s and '.' in s:
                if s.rfind(',') > s.rfind('.'):
                    # Ej: 1.234,56 -> remover puntos, reemplazar coma por punto
                    s = s.replace('.', '').replace(',', '.')
                else:
                    # Ej: 1,234.56 -> remover comas
                    s = s.replace(',', '')
            else:
                # Solo comas: 1234,56 -> reemplazar por punto
                if ',' in s and '.' not in s:
                    s = s.replace(',', '.')
                # Solo punto: dejar como está
            # Remover cualquier caracter que no sea dígito o punto
            s = re.sub(r'[^0-9\.-]', '', s)
            if s in ['', '.', '-']:
                raise InvalidOperation("Formato de precio inválido")
            return Decimal(s)

        # Aceptar variantes de moneda en columnas: 'ARS', 'USD', 'U$S', 'US$', 'peso', 'dolar', 'dólar'
        moneda_aliases = {
            'ars': 'ARS', 'peso': 'ARS', 'pesos': 'ARS', 'arg': 'ARS',
            'usd': 'USD', 'u$s': 'USD', 'us$': 'USD', 'dolar': 'USD', 'dólar': 'USD', 'dollars': 'USD'
        }

        for index, row in df.iterrows():
            linea_num = index + 2
            # Soportar identificación por ID si viene en el Excel exportado
            cliente_raw = None
            producto_raw = None
            cliente_id_val = None
            producto_id_val = None
            if cliente_id_col:
                cliente_id_val = row.get(cliente_id_col, None)
            if producto_id_col:
                producto_id_val = row.get(producto_id_col, None)
            if cliente_col:
                cliente_raw = row.get(cliente_col, '')
            if producto_col:
                producto_raw = row.get(producto_col, '')
            precio_raw = row.get(precio_col, '')
            moneda_raw = row.get(moneda_col, '') if moneda_col else ''

            # Resolver cliente/ producto por ID si vienen
            cliente = None
            producto = None
            if cliente_id_val and str(cliente_id_val).strip() != '':
                try:
                    cid = int(float(cliente_id_val))
                    cliente = db.session.get(Cliente, cid)
                except Exception:
                    cliente = None
            else:
                cliente_key = normalize_text(cliente_raw)
                cliente = clientes_db.get(cliente_key)

            if not cliente:
                registrar_error(linea_num, cliente_raw or cliente_id_val, producto_raw or producto_id_val, f"Cliente '{cliente_raw or cliente_id_val}' no encontrado.")
                acciones_por_fila.append({
                    'linea': linea_num,
                    'accion': 'error',
                    'motivo': f"Cliente '{cliente_raw or cliente_id_val}' no encontrado.",
                    'cliente': cliente_raw or cliente_id_val,
                    'producto': producto_raw or producto_id_val
                })
                continue

            if producto_id_val and str(producto_id_val).strip() != '':
                try:
                    pid = int(float(producto_id_val))
                    producto = db.session.get(Producto, pid)
                except Exception:
                    producto = None
            else:
                producto_key = normalize_text(producto_raw)
                producto = productos_db.get(producto_key)

            if not producto:
                registrar_error(linea_num, cliente_raw or cliente_id_val, producto_raw or producto_id_val, f"Producto '{producto_raw or producto_id_val}' no encontrado.")
                acciones_por_fila.append({
                    'linea': linea_num,
                    'accion': 'error',
                    'motivo': f"Producto '{producto_raw or producto_id_val}' no encontrado.",
                    'cliente': cliente_raw or cliente_id_val,
                    'producto': producto_raw or producto_id_val
                })
                continue

            # Debug: registrar coincidencias para diagnósticos
            try:
                logger.info("[cargar_csv] fila=%s cliente_key=%s cliente_id=%s producto_key=%s producto_id=%s", linea_num, cliente_key, getattr(cliente, 'id', None), producto_key, getattr(producto, 'id', None))
            except Exception:
                logger.info("[cargar_csv] fila=%s cliente_key=%s producto_key=%s (no ids disponibles)", linea_num, cliente_key, producto_key)

            moneda_norm = normalize_text(moneda_raw)
            moneda_csv = moneda_aliases.get(moneda_norm, None) if moneda_norm else None
            # Si no viene moneda, asumimos ARS
            if moneda_csv is None:
                moneda_csv = 'ARS'

            if moneda_csv not in ['ARS', 'USD']:
                registrar_error(linea_num, cliente_raw, producto_raw, f"Moneda '{moneda_raw}' no válida. Use 'ARS' o 'USD'.")
                acciones_por_fila.append({
                    'linea': linea_num,
                    'accion': 'error',
                    'motivo': f"Moneda '{moneda_raw}' no válida.",
                    'cliente': cliente_raw,
                    'producto': producto_raw,
                    'moneda': moneda_raw
                })
                continue

            try:
                precio_original = parse_price_to_decimal(precio_raw)
                if precio_original < 0:
                    raise ValueError("Precio negativo")
            except (InvalidOperation, ValueError) as e:
                registrar_error(linea_num, cliente_raw, producto_raw, f"Precio '{precio_raw}' no es un número válido: {e}")
                acciones_por_fila.append({
                    'linea': linea_num,
                    'accion': 'error',
                    'motivo': f"Precio '{precio_raw}' no es un número válido: {e}",
                    'cliente': cliente_raw,
                    'producto': producto_raw,
                    'precio_raw': precio_raw
                })
                continue

            # --- LÓGICA DE CONVERSIÓN Y REGISTRO DE MONEDA ---
            if moneda_csv == 'USD':
                # Guarda el precio original en USD y calcula el ARS actual
                precio_final_ars = precio_original * valor_dolar_oficial
                precio_original_usd = precio_original
            else:
                # Guarda el precio original en ARS
                precio_final_ars = precio_original
                precio_original_usd = None

            # Lógica de creación/actualización
            precio_esp_existente = precios_existentes.get((cliente.id, producto.id))

            if precio_esp_existente:
                old_val = precio_esp_existente.precio_unitario_fijo_ars
                logger.info("[cargar_csv] actualizar existente: precio_esp_id=%s cliente_id=%s producto_id=%s old=%s new=%s", getattr(precio_esp_existente, 'id', None), cliente.id, producto.id, str(old_val), str(precio_final_ars))
                # Guardar campos nuevos: moneda_original, precio_original, tipo_cambio_usado
                precio_esp_existente.moneda_original = moneda_csv
                precio_esp_existente.precio_original = precio_original_usd if moneda_csv == 'USD' else precio_final_ars
                precio_esp_existente.tipo_cambio_usado = (valor_dolar_oficial if moneda_csv == 'USD' else None)
                precio_esp_existente.precio_unitario_fijo_ars = precio_final_ars
                precio_esp_existente.activo = True
                logger.info("[cargar_csv] asignado nuevo valor a precio_esp (sin commit aún): precio_esp_id=%s cliente_id=%s producto_id=%s new=%s", getattr(precio_esp_existente, 'id', None), cliente.id, producto.id, str(precio_final_ars))
                registros_actualizados += 1
                acciones_por_fila.append({
                    'linea': linea_num,
                    'accion': 'actualizado',
                    'cliente_id': cliente.id,
                    'producto_id': producto.id,
                    'old_val_ars': float(old_val) if old_val is not None else None,
                    'new_val_ars': float(precio_final_ars),
                    'moneda': moneda_csv,
                    'precio_original': float(precio_original_usd) if precio_original_usd is not None else float(precio_final_ars),
                    'tipo_cambio_usado': float(valor_dolar_oficial) if moneda_csv == 'USD' else None
                })
            else:
                logger.info("[cargar_csv] creando nuevo precio_esp: cliente_id=%s producto_id=%s precio=%s", cliente.id, producto.id, str(precio_final_ars))
                nuevo_precio_esp = PrecioEspecialCliente(
                    cliente_id=cliente.id,
                    producto_id=producto.id,
                    precio_unitario_fijo_ars=precio_final_ars,
                    moneda_original=moneda_csv,
                    precio_original=precio_original_usd if moneda_csv == 'USD' else precio_final_ars,
                    tipo_cambio_usado=(valor_dolar_oficial if moneda_csv == 'USD' else None),
                    activo=True
                )
                db.session.add(nuevo_precio_esp)
                precios_existentes[(cliente.id, producto.id)] = nuevo_precio_esp
                registros_creados += 1
                acciones_por_fila.append({
                    'linea': linea_num,
                    'accion': 'creado',
                    'cliente_id': cliente.id,
                    'producto_id': producto.id,
                    'new_val_ars': float(precio_final_ars),
                    'moneda': moneda_csv,
                    'precio_original': float(precio_original_usd) if precio_original_usd is not None else float(precio_final_ars),
                    'tipo_cambio_usado': float(valor_dolar_oficial) if moneda_csv == 'USD' else None
                })
        
        # --- 5. COMMIT Y RESPUESTA FINAL ---
        db.session.commit()
        
        summary = {
            "creados": registros_creados, "actualizados": registros_actualizados,
            "errores": len(filas_fallidas)
        }

        debug_mode = request.args.get('debug', 'false').lower() == 'true'
        if filas_fallidas:
            payload = {
                "status": "completed_with_errors",
                "message": f"Proceso completado. Se procesaron {registros_creados + registros_actualizados} registros, pero {len(filas_fallidas)} filas tuvieron errores.",
                "summary": summary,
                "failed_rows": filas_fallidas
            }
            if debug_mode:
                payload['acciones_por_fila'] = acciones_por_fila
            return jsonify(payload), 207
        else:
            payload = {
                "status": "success", "message": "Carga masiva completada exitosamente sin errores.",
                "summary": summary
            }
            if debug_mode:
                payload['acciones_por_fila'] = acciones_por_fila
            return jsonify(payload), 200

    except pd.errors.ParserError as e:
        logger.exception("Error de parser al leer CSV: %s", e)
        return jsonify({"error": "Error de formato en el archivo CSV.", "detalle": str(e)}), 400
    except Exception as e:
        db.session.rollback()
        logger.exception("Ocurrió un error crítico durante la carga masiva de precios: %s", e)
        return jsonify({"error": "Ocurrió un error crítico durante el proceso.", "detalle": str(e)}), 500