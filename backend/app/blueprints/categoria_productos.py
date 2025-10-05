# app/blueprints/categoria_productos.py
# Endpoint adicional para gestión masiva de categorías en productos

from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError
from decimal import Decimal
import traceback

# --- Imports locales ---
from .. import db
from ..models import CategoriaProducto, Producto
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES

# --- Blueprint ---
categoria_productos_bp = Blueprint('categoria_productos', __name__, url_prefix='/categoria_productos')

@categoria_productos_bp.route('/asignar_masivo', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'])
def asignar_categoria_masivo(current_user):
    """
    Asigna una categoría a múltiples productos de forma masiva.
    
    Payload esperado:
    {
        "categoria_id": 1,
        "producto_ids": [1, 2, 3, 4]
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No se enviaron datos'}), 400
        
        categoria_id = data.get('categoria_id')
        producto_ids = data.get('producto_ids', [])
        
        if categoria_id is None:
            return jsonify({'error': 'categoria_id es requerido'}), 400
        
        if not isinstance(producto_ids, list) or len(producto_ids) == 0:
            return jsonify({'error': 'producto_ids debe ser una lista no vacía'}), 400
        
        # Verificar que la categoría existe y está activa
        categoria = CategoriaProducto.query.get(categoria_id)
        if not categoria:
            return jsonify({'error': f'Categoría con ID {categoria_id} no encontrada'}), 404
        
        if not categoria.activo:
            return jsonify({'error': f'La categoría "{categoria.nombre}" está inactiva'}), 400
        
        # Obtener productos que existen
        productos = Producto.query.filter(Producto.id.in_(producto_ids)).all()
        productos_encontrados = [p.id for p in productos]
        productos_no_encontrados = [pid for pid in producto_ids if pid not in productos_encontrados]
        
        # Actualizar categoría de los productos encontrados
        productos_actualizados = 0
        for producto in productos:
            producto.categoria_id = categoria_id
            productos_actualizados += 1
        
        db.session.commit()
        
        resultado = {
            'mensaje': f'Se asignó la categoría "{categoria.nombre}" a {productos_actualizados} productos',
            'categoria': categoria.to_dict(),
            'productos_actualizados': productos_encontrados,
            'productos_no_encontrados': productos_no_encontrados,
            'total_actualizados': productos_actualizados
        }
        
        if productos_no_encontrados:
            resultado['advertencia'] = f'Se encontraron {len(productos_no_encontrados)} productos que no existen'
        
        return jsonify(resultado)
        
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': 'Error interno al asignar categorías', 'detalle': str(e)}), 500

@categoria_productos_bp.route('/quitar_categoria_masivo', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'])
def quitar_categoria_masivo(current_user):
    """
    Quita la categoría de múltiples productos (los deja sin categoría).
    
    Payload esperado:
    {
        "producto_ids": [1, 2, 3, 4]
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No se enviaron datos'}), 400
        
        producto_ids = data.get('producto_ids', [])
        
        if not isinstance(producto_ids, list) or len(producto_ids) == 0:
            return jsonify({'error': 'producto_ids debe ser una lista no vacía'}), 400
        
        # Obtener productos que existen
        productos = Producto.query.filter(Producto.id.in_(producto_ids)).all()
        productos_encontrados = [p.id for p in productos]
        productos_no_encontrados = [pid for pid in producto_ids if pid not in productos_encontrados]
        
        # Quitar categoría de los productos encontrados
        productos_actualizados = 0
        for producto in productos:
            producto.categoria_id = None
            productos_actualizados += 1
        
        db.session.commit()
        
        resultado = {
            'mensaje': f'Se quitó la categoría de {productos_actualizados} productos',
            'productos_actualizados': productos_encontrados,
            'productos_no_encontrados': productos_no_encontrados,
            'total_actualizados': productos_actualizados
        }
        
        if productos_no_encontrados:
            resultado['advertencia'] = f'Se encontraron {len(productos_no_encontrados)} productos que no existen'
        
        return jsonify(resultado)
        
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': 'Error interno al quitar categorías', 'detalle': str(e)}), 500

@categoria_productos_bp.route('/sin_categoria', methods=['GET'])
@token_required
def productos_sin_categoria(current_user):
    """
    Lista todos los productos que no tienen categoría asignada.
    """
    try:
        activo = request.args.get('activo')
        
        query = Producto.query.filter(Producto.categoria_id.is_(None))
        
        if activo is not None:
            activo_bool = activo.lower() in ['true', '1', 'yes']
            query = query.filter(Producto.activo == activo_bool)
        
        productos = query.order_by(Producto.nombre.asc()).all()
        
        productos_data = []
        for producto in productos:
            productos_data.append({
                'id': producto.id,
                'nombre': producto.nombre,
                'unidad_venta': producto.unidad_venta,
                'activo': producto.activo,
                'es_receta': producto.es_receta,
                'margen': float(producto.margen) if producto.margen else None,
                'costo_referencia_usd': float(producto.costo_referencia_usd) if producto.costo_referencia_usd else None
            })
        
        return jsonify({
            'productos_sin_categoria': productos_data,
            'total': len(productos_data)
        })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'Error interno al obtener productos sin categoría', 'detalle': str(e)}), 500

@categoria_productos_bp.route('/migrar_por_tipo', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'])
def migrar_productos_por_tipo(current_user):
    """
    Migra productos a categorías basándose en su tipo (es_receta, activo, etc.).
    
    Útil para la migración inicial cuando se agregan categorías por primera vez.
    
    Payload esperado:
    {
        "reglas": [
            {
                "condicion": "es_receta",
                "valor": true,
                "categoria_id": 4
            },
            {
                "condicion": "es_receta",
                "valor": false,
                "categoria_id": 2
            }
        ]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'reglas' not in data:
            return jsonify({'error': 'Se requiere el campo "reglas"'}), 400
        
        reglas = data.get('reglas', [])
        
        if not isinstance(reglas, list) or len(reglas) == 0:
            return jsonify({'error': 'reglas debe ser una lista no vacía'}), 400
        
        resultados = []
        total_productos_migrados = 0
        
        for i, regla in enumerate(reglas):
            try:
                condicion = regla.get('condicion')
                valor = regla.get('valor')
                categoria_id = regla.get('categoria_id')
                
                if not condicion or categoria_id is None:
                    resultados.append({
                        'regla_index': i,
                        'error': 'Faltan campos requeridos: condicion, categoria_id'
                    })
                    continue
                
                # Verificar que la categoría existe
                categoria = CategoriaProducto.query.get(categoria_id)
                if not categoria:
                    resultados.append({
                        'regla_index': i,
                        'error': f'Categoría con ID {categoria_id} no encontrada'
                    })
                    continue
                
                # Aplicar la regla según la condición
                if condicion == 'es_receta':
                    productos = Producto.query.filter(
                        Producto.es_receta == bool(valor),
                        Producto.categoria_id.is_(None)  # Solo productos sin categoría
                    ).all()
                elif condicion == 'activo':
                    productos = Producto.query.filter(
                        Producto.activo == bool(valor),
                        Producto.categoria_id.is_(None)
                    ).all()
                else:
                    resultados.append({
                        'regla_index': i,
                        'error': f'Condición "{condicion}" no soportada'
                    })
                    continue
                
                # Actualizar productos
                productos_actualizados = 0
                for producto in productos:
                    producto.categoria_id = categoria_id
                    productos_actualizados += 1
                
                total_productos_migrados += productos_actualizados
                
                resultados.append({
                    'regla_index': i,
                    'condicion': condicion,
                    'valor': valor,
                    'categoria': categoria.to_dict(),
                    'productos_migrados': productos_actualizados
                })
                
            except Exception as regla_error:
                resultados.append({
                    'regla_index': i,
                    'error': f'Error en regla: {str(regla_error)}'
                })
        
        db.session.commit()
        
        return jsonify({
            'mensaje': f'Migración completada. {total_productos_migrados} productos migrados en total',
            'resultados': resultados,
            'total_productos_migrados': total_productos_migrados
        })
        
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': 'Error interno en la migración', 'detalle': str(e)}), 500


@categoria_productos_bp.route('/asignar_por_nombres', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'])
def asignar_categoria_por_nombres(current_user):
    """
    Asigna categorías a productos basándose en los nombres de los productos.
    
    Payload esperado:
    {
        "reglas": [
            {
                "categoria_id": 1,
                "nombres_productos": ["Producto A", "Producto B", "Producto C"]
            },
            {
                "categoria_id": 2, 
                "nombres_productos": ["Producto D", "Producto E"]
            }
        ]
    }
    
    También acepta coincidencias parciales:
    {
        "reglas": [
            {
                "categoria_id": 1,
                "nombres_productos": ["ACIDO", "SODA"],
                "coincidencia_parcial": true
            }
        ]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'reglas' not in data:
            return jsonify({'error': 'Debe proporcionar una lista de reglas'}), 400
        
        reglas = data['reglas']
        resultados = []
        total_productos_actualizados = 0
        
        for i, regla in enumerate(reglas):
            try:
                categoria_id = regla.get('categoria_id')
                nombres_productos = regla.get('nombres_productos', [])
                coincidencia_parcial = regla.get('coincidencia_parcial', False)
                
                if not categoria_id:
                    resultados.append({
                        'regla_index': i,
                        'error': 'categoria_id es requerido'
                    })
                    continue
                
                if not nombres_productos:
                    resultados.append({
                        'regla_index': i,
                        'error': 'nombres_productos es requerido y no puede estar vacío'
                    })
                    continue
                
                # Verificar que la categoría existe
                categoria = CategoriaProducto.query.get(categoria_id)
                if not categoria:
                    resultados.append({
                        'regla_index': i,
                        'error': f'Categoría con ID {categoria_id} no existe'
                    })
                    continue
                
                productos_encontrados = []
                productos_no_encontrados = []
                productos_actualizados = 0
                
                for nombre_producto in nombres_productos:
                    if coincidencia_parcial:
                        # Buscar productos que contengan el nombre (case insensitive)
                        productos = Producto.query.filter(
                            Producto.nombre.ilike(f'%{nombre_producto}%')
                        ).all()
                    else:
                        # Buscar producto con nombre exacto (case insensitive)
                        productos = Producto.query.filter(
                            Producto.nombre.ilike(nombre_producto)
                        ).all()
                    
                    if productos:
                        for producto in productos:
                            productos_encontrados.append({
                                'id': producto.id,
                                'nombre': producto.nombre,
                                'categoria_anterior': producto.categoria.nombre if producto.categoria else None
                            })
                            producto.categoria_id = categoria_id
                            productos_actualizados += 1
                    else:
                        productos_no_encontrados.append(nombre_producto)
                
                total_productos_actualizados += productos_actualizados
                
                resultados.append({
                    'regla_index': i,
                    'categoria_id': categoria_id,
                    'categoria_nombre': categoria.nombre,
                    'productos_actualizados': productos_actualizados,
                    'productos_encontrados': productos_encontrados,
                    'productos_no_encontrados': productos_no_encontrados,
                    'coincidencia_parcial': coincidencia_parcial
                })
                
            except Exception as regla_error:
                resultados.append({
                    'regla_index': i,
                    'error': f'Error en regla: {str(regla_error)}'
                })
        
        db.session.commit()
        
        return jsonify({
            'mensaje': f'Asignación por nombres completada. {total_productos_actualizados} productos actualizados en total',
            'resultados': resultados,
            'total_productos_actualizados': total_productos_actualizados
        })
        
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': 'Error interno en la asignación por nombres', 'detalle': str(e)}), 500

@categoria_productos_bp.route('/upload_clasificacion_csv', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'])
def upload_clasificacion_csv(current_user):
    """
    Recibe un archivo CSV con columnas: ID/Código, Nombre, Categoria
    Asigna la categoría a cada producto por nombre (coincidencia parcial, case-insensitive).
    El archivo debe subirse como multipart/form-data con campo 'file'.
    """
    import csv
    from io import StringIO
    try:
        if 'file' not in request.files:
            return jsonify({'error': "No se envió archivo (campo 'file')"}), 400
        archivo = request.files['file']
        contenido = archivo.read().decode('utf-8', errors='ignore')
        lector = csv.DictReader(StringIO(contenido))
        resultados = []
        total_actualizados = 0
        productos_no_encontrados = []
        categorias_no_encontradas = []
        for fila in lector:
            nombre = fila.get('Nombre', '').strip()
            categoria_nombre = fila.get('Categoria', '').strip()
            if not nombre or not categoria_nombre:
                continue
            categoria = CategoriaProducto.query.filter(CategoriaProducto.nombre.ilike(categoria_nombre)).first()
            if not categoria:
                categorias_no_encontradas.append(categoria_nombre)
                resultados.append({'nombre': nombre, 'error': f'Categoría "{categoria_nombre}" no encontrada'})
                continue
            productos = Producto.query.filter(Producto.nombre.ilike(f'%{nombre}%')).all()
            if not productos:
                productos_no_encontrados.append(nombre)
                resultados.append({'nombre': nombre, 'error': 'Producto no encontrado'})
                continue
            for producto in productos:
                producto.categoria_id = categoria.id
                total_actualizados += 1
                resultados.append({'id': producto.id, 'nombre': producto.nombre, 'categoria_id': categoria.id, 'categoria_nombre': categoria.nombre})
        db.session.commit()
        return jsonify({
            'mensaje': f'Clasificación completada. {total_actualizados} productos actualizados.',
            'resultados': resultados,
            'total_actualizados': total_actualizados,
            'productos_no_encontrados': productos_no_encontrados,
            'categorias_no_encontradas': list(set(categorias_no_encontradas))
        })
    except Exception as e:
        db.session.rollback()
        import traceback; traceback.print_exc()
        return jsonify({'error': 'Error procesando el archivo', 'detalle': str(e)}), 500