# app/blueprints/precios_especiales.py
from flask import Blueprint, request, jsonify
from sqlalchemy.orm import joinedload # Para cargar datos relacionados eficientemente
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
import traceback
import pandas as pd
import io
import csv

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

# --- Helpers ---
def precio_especial_a_dict(precio_esp):
    """Serializa un objeto PrecioEspecialCliente a diccionario."""
    if not precio_esp: return None
    return {
        "id": precio_esp.id,
        "cliente_id": precio_esp.cliente_id,
        "cliente_nombre": precio_esp.cliente.nombre_razon_social if precio_esp.cliente else None, # Asume 'razon_social'
        "producto_id": precio_esp.producto_id,
#        "producto_codigo": precio_esp.producto.codigo_interno if precio_esp.producto else None,
        "producto_nombre": precio_esp.producto.nombre if precio_esp.producto else None,
        "precio_unitario_fijo_ars": float(precio_esp.precio_unitario_fijo_ars) if precio_esp.precio_unitario_fijo_ars is not None else None,
        "activo": precio_esp.activo,
        "fecha_creacion": precio_esp.fecha_creacion.isoformat() if precio_esp.fecha_creacion else None,
        "fecha_modificacion": precio_esp.fecha_modificacion.isoformat() if precio_esp.fecha_modificacion else None,
    }

# --- Endpoints CRUD ---

@precios_especiales_bp.route('/crear', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN']) # O un rol 'GESTOR_PRECIOS'
def crear_precio_especial(current_user):
    """Crea una nueva regla de precio especial."""
    data = request.get_json()
    if not data or 'cliente_id' not in data or 'producto_id' not in data or 'precio_unitario_fijo_ars' not in data:
        return jsonify({"error": "Faltan datos: cliente_id, producto_id, precio_unitario_fijo_ars"}), 400

    cliente_id = data['cliente_id']
    producto_id = data['producto_id']
    precio_str = str(data['precio_unitario_fijo_ars']).strip()
    activo = data.get('activo', True) # Default a activo

    # Validar IDs
    if not isinstance(cliente_id, int) or not isinstance(producto_id, int):
         return jsonify({"error": "cliente_id y producto_id deben ser enteros"}), 400
    if not db.session.get(Cliente, cliente_id):
        return jsonify({"error": f"Cliente ID {cliente_id} no encontrado"}), 404
    if not db.session.get(Producto, producto_id):
        return jsonify({"error": f"Producto ID {producto_id} no encontrado"}), 404

    # Validar precio
    try:
        precio_decimal = Decimal(precio_str)
        if precio_decimal < 0: raise ValueError("Precio no puede ser negativo")
        # Podrías redondear aquí si quieres forzar una precisión
        # precio_decimal = redondear_decimal(precio_decimal, 4)
    except (InvalidOperation, ValueError) as e:
        return jsonify({"error": f"Precio unitario inválido: {e}"}), 400

    # Verificar si ya existe (manejar UniqueConstraint)
    existente = PrecioEspecialCliente.query.filter_by(cliente_id=cliente_id, producto_id=producto_id).first()
    if existente:
        return jsonify({"error": f"Ya existe un precio especial para este cliente y producto (ID: {existente.id}). Use PUT para modificarlo."}), 409 # Conflict

    try:
        nuevo_precio = PrecioEspecialCliente(
            cliente_id=cliente_id,
            producto_id=producto_id,
            precio_unitario_fijo_ars=precio_decimal,
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
        print(f"ERROR [crear_precio_especial]: Excepción {e}")
        traceback.print_exc()
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
        print(f"ERROR [listar_precios_especiales]: Excepción {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno al listar precios especiales"}), 500


@precios_especiales_bp.route('/obtener-por-cliente/<int:client_id>', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['VENTAS_PEDIDOS'])
def obtener_precio_especial(current_user, client_id):
    """Obtiene todos los precios especiales para un cliente por su ID."""
    precios_esp = db.session.query(PrecioEspecialCliente).options(
        joinedload(PrecioEspecialCliente.cliente),
        joinedload(PrecioEspecialCliente.producto)
    ).filter(PrecioEspecialCliente.cliente_id == client_id).all()

    if not precios_esp:
        return jsonify({"error": "No se encontraron precios especiales para este cliente"}), 404
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

        if 'activo' in data:
            if not isinstance(data['activo'], bool):
                return jsonify({"error": "'activo' debe ser un booleano (true/false)"}), 400
            if precio_esp.activo != data['activo']:
                precio_esp.activo = data['activo']
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
        print(f"ERROR [actualizar_precio_especial]: Excepción {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno al actualizar el precio especial"}), 500


@precios_especiales_bp.route('/eliminar/<int:precio_id>', methods=['DELETE'])
@token_required
@roles_required(ROLES['ADMIN'])
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
        print(f"ERROR [eliminar_precio_especial]: Excepción {e}")
        traceback.print_exc()
        return jsonify({"error": "Error interno al eliminar el precio especial"}), 500
    
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
        print(f"ERROR [actualizar_precios_masivamente]: Excepción {e}")
        traceback.print_exc()
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

    if not file.filename.lower().endswith('.csv'):
        return jsonify({"error": "El archivo debe tener la extensión .csv"}), 400

    try:
        # --- 1. LECTURA Y DETECCIÓN DE DELIMITADOR ---
        contenido_bytes = file.stream.read()
        if not contenido_bytes:
            return jsonify({"error": "El archivo está vacío."}), 400
            
        contenido_str = contenido_bytes.decode('utf-8-sig')
        
        try:
            dialect = csv.Sniffer().sniff(contenido_str.splitlines()[0], delimiters=',;')
            delimitador_detectado = dialect.delimiter
        except csv.Error:
            return jsonify({"error": "No se pudo determinar el formato del CSV. Use comas (,) o punto y coma (;) como separador."}), 400

        # --- 2. LECTURA CON PANDAS ---
        df = pd.read_csv(
            io.StringIO(contenido_str),
            sep=delimitador_detectado,
            keep_default_na=False,
            dtype=str
        )

        # --- 3. PREPARACIÓN DE DATOS (CACHÉ) ---
        tc_oficial_obj = TipoCambio.query.filter_by(nombre='Oficial').first()
        if not tc_oficial_obj or not tc_oficial_obj.valor or tc_oficial_obj.valor <= 0:
            return jsonify({"error": "El Tipo de Cambio 'Oficial' no está configurado o no es válido."}), 500
        valor_dolar_oficial = tc_oficial_obj.valor
        
        clientes_db = {c.nombre_razon_social.strip().upper(): c for c in Cliente.query.all()}
        productos_db = {p.nombre.strip().upper(): p for p in Producto.query.all()}
        precios_existentes = {(pe.cliente_id, pe.producto_id): pe for pe in PrecioEspecialCliente.query.all()}

        # --- 4. PROCESAMIENTO DE FILAS ---
        registros_creados = 0
        registros_actualizados = 0
        filas_fallidas = []
        required_columns = {'Cliente', 'Producto', 'Precio', 'Moneda'}

        if not required_columns.issubset(df.columns):
            return jsonify({"error": f"El CSV debe contener las columnas exactas: {', '.join(required_columns)}"}), 400

        for index, row in df.iterrows():
            linea_num = index + 2
            
            def registrar_error(motivo):
                filas_fallidas.append({
                    "linea": linea_num, "cliente": row.get('Cliente', 'N/A'),
                    "producto": row.get('Producto', 'N/A'), "motivo": motivo
                })

            nombre_cliente_csv = str(row.get('Cliente', '')).strip().upper()
            nombre_producto_csv = str(row.get('Producto', '')).strip().upper()
            precio_csv_str = str(row.get('Precio', '')).strip().replace(',', '.')
            moneda_csv = str(row.get('Moneda', '')).strip().upper()

            # Validaciones
            cliente = clientes_db.get(nombre_cliente_csv)
            if not cliente:
                registrar_error(f"Cliente '{row.get('Cliente')}' no encontrado.")
                continue

            producto = productos_db.get(nombre_producto_csv)
            if not producto:
                registrar_error(f"Producto '{row.get('Producto')}' no encontrado.")
                continue
            
            if moneda_csv not in ['ARS', 'USD']:
                registrar_error(f"Moneda '{row.get('Moneda')}' no válida. Usar 'ARS' o 'USD'.")
                continue
            
            try:
                precio_original = Decimal(precio_csv_str)
                if precio_original < 0: raise ValueError
            except (InvalidOperation, ValueError):
                registrar_error(f"Precio '{row.get('Precio')}' no es un número válido.")
                continue

            # --- LÓGICA DE CONVERSIÓN DE MONEDA SIMPLIFICADA ---
            precio_final_ars = precio_original
            if moneda_csv == 'USD':
                # Si la moneda es USD, siempre multiplica por el TC Oficial.
                precio_final_ars = precio_original * valor_dolar_oficial
            
            # Lógica de creación/actualización
            precio_esp_existente = precios_existentes.get((cliente.id, producto.id))

            if precio_esp_existente:
                precio_esp_existente.precio_unitario_fijo_ars = precio_final_ars
                precio_esp_existente.activo = True
                registros_actualizados += 1
            else:
                nuevo_precio_esp = PrecioEspecialCliente(cliente_id=cliente.id, producto_id=producto.id, precio_unitario_fijo_ars=precio_final_ars, activo=True)
                db.session.add(nuevo_precio_esp)
                precios_existentes[(cliente.id, producto.id)] = nuevo_precio_esp
                registros_creados += 1
        
        # --- 5. COMMIT Y RESPUESTA FINAL ---
        db.session.commit()
        
        summary = {
            "creados": registros_creados, "actualizados": registros_actualizados,
            "errores": len(filas_fallidas)
        }

        if filas_fallidas:
            return jsonify({
                "status": "completed_with_errors",
                "message": f"Proceso completado. Se procesaron {registros_creados + registros_actualizados} registros, pero {len(filas_fallidas)} filas tuvieron errores.",
                "summary": summary, "failed_rows": filas_fallidas
            }), 207
        else:
            return jsonify({
                "status": "success", "message": "Carga masiva completada exitosamente sin errores.",
                "summary": summary
            }), 200

    except pd.errors.ParserError as e:
        return jsonify({"error": "Error de formato en el archivo CSV.", "detalle": str(e)}), 400
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"error": "Ocurrió un error crítico durante el proceso.", "detalle": str(e)}), 500