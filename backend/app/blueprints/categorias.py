# app/blueprints/categorias.py

from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timezone
from decimal import Decimal
import traceback

# --- Imports locales ---
from .. import db
from ..models import CategoriaProducto, Producto
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES

# --- Blueprint ---
categorias_bp = Blueprint('categorias', __name__, url_prefix='/categorias')

@categorias_bp.route('/', methods=['GET'])
@token_required
def listar_categorias(current_user):
    """
    Lista todas las categorías de productos.
    Opcionalmente filtrar por activo=true/false
    """
    try:
        activo = request.args.get('activo')
        
        query = CategoriaProducto.query
        
        if activo is not None:
            activo_bool = activo.lower() in ['true', '1', 'yes']
            query = query.filter(CategoriaProducto.activo == activo_bool)
        
        categorias = query.order_by(CategoriaProducto.nombre.asc()).all()
        
        return jsonify({
            'categorias': [categoria.to_dict() for categoria in categorias],
            'total': len(categorias)
        })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'Error interno al obtener categorías', 'detalle': str(e)}), 500

@categorias_bp.route('/', methods=['POST'])
@token_required
@roles_required(ROLES['ADMIN'])
def crear_categoria(current_user):
    """
    Crea una nueva categoría de producto.
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No se enviaron datos'}), 400
        
        nombre = data.get('nombre', '').strip()
        if not nombre:
            return jsonify({'error': 'El nombre es requerido'}), 400
        
        # Verificar que no exista ya una categoría con ese nombre
        categoria_existente = CategoriaProducto.query.filter_by(nombre=nombre).first()
        if categoria_existente:
            return jsonify({'error': f'Ya existe una categoría con el nombre "{nombre}"'}), 400
        
        categoria = CategoriaProducto(
            nombre=nombre,
            descripcion=(data.get('descripcion') or '').strip() or None,
            activo=data.get('activo', True)
        )
        
        db.session.add(categoria)
        db.session.commit()
        
        return jsonify({
            'mensaje': 'Categoría creada exitosamente',
            'categoria': categoria.to_dict()
        }), 201
        
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'Ya existe una categoría con ese nombre'}), 400
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': 'Error interno al crear categoría', 'detalle': str(e)}), 500

@categorias_bp.route('/<int:categoria_id>', methods=['GET'])
@token_required
def obtener_categoria(current_user, categoria_id):
    """
    Obtiene una categoría específica por ID.
    """
    try:
        categoria = CategoriaProducto.query.get(categoria_id)
        
        if not categoria:
            return jsonify({'error': 'Categoría no encontrada'}), 404
        
        return jsonify({'categoria': categoria.to_dict()})
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'Error interno al obtener categoría', 'detalle': str(e)}), 500

@categorias_bp.route('/<int:categoria_id>', methods=['PUT'])
@token_required
@roles_required(ROLES['ADMIN'])
def actualizar_categoria(current_user, categoria_id):
    """
    Actualiza una categoría existente.
    """
    try:
        categoria = CategoriaProducto.query.get(categoria_id)
        
        if not categoria:
            return jsonify({'error': 'Categoría no encontrada'}), 404
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se enviaron datos'}), 400
        
        # Actualizar campos si se proporcionan
        if 'nombre' in data:
            nombre = data['nombre'].strip()
            if not nombre:
                return jsonify({'error': 'El nombre no puede estar vacío'}), 400
            
            # Verificar que no exista ya otra categoría con ese nombre
            categoria_existente = CategoriaProducto.query.filter(
                CategoriaProducto.nombre == nombre,
                CategoriaProducto.id != categoria_id
            ).first()
            
            if categoria_existente:
                return jsonify({'error': f'Ya existe otra categoría con el nombre "{nombre}"'}), 400
            
            categoria.nombre = nombre
        
        if 'descripcion' in data:
            # Defensive: data['descripcion'] may be None, make safe before strip()
            categoria.descripcion = (data.get('descripcion') or '').strip() or None
        
        if 'activo' in data:
            categoria.activo = bool(data['activo'])
        
        categoria.fecha_modificacion = datetime.now(timezone.utc)
        
        db.session.commit()
        
        return jsonify({
            'mensaje': 'Categoría actualizada exitosamente',
            'categoria': categoria.to_dict()
        })
        
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'Ya existe una categoría con ese nombre'}), 400
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': 'Error interno al actualizar categoría', 'detalle': str(e)}), 500

@categorias_bp.route('/<int:categoria_id>', methods=['DELETE'])
@token_required
@roles_required(ROLES['ADMIN'])
def eliminar_categoria(current_user, categoria_id):
    """
    Elimina una categoría (si no tiene productos asociados) o la desactiva.
    """
    try:
        categoria = CategoriaProducto.query.get(categoria_id)
        
        if not categoria:
            return jsonify({'error': 'Categoría no encontrada'}), 404
        
        # Verificar si hay productos asociados a esta categoría
        productos_asociados = Producto.query.filter_by(categoria_id=categoria_id).count()
        
        if productos_asociados > 0:
            # Si hay productos asociados, solo desactivar la categoría
            categoria.activo = False
            categoria.fecha_modificacion = datetime.now(timezone.utc)
            db.session.commit()
            
            return jsonify({
                'mensaje': f'Categoría desactivada (tiene {productos_asociados} productos asociados)',
                'categoria': categoria.to_dict()
            })
        else:
            # Si no hay productos asociados, eliminar la categoría
            db.session.delete(categoria)
            db.session.commit()
            
            return jsonify({
                'mensaje': 'Categoría eliminada exitosamente'
            })
        
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': 'Error interno al eliminar categoría', 'detalle': str(e)}), 500

@categorias_bp.route('/<int:categoria_id>/productos', methods=['GET'])
@token_required
def productos_por_categoria(current_user, categoria_id):
    """
    Lista todos los productos de una categoría específica.
    """
    try:
        categoria = CategoriaProducto.query.get(categoria_id)
        
        if not categoria:
            return jsonify({'error': 'Categoría no encontrada'}), 404
        
        productos = Producto.query.filter_by(categoria_id=categoria_id).order_by(Producto.nombre.asc()).all()
        
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
            'categoria': categoria.to_dict(),
            'productos': productos_data,
            'total_productos': len(productos_data)
        })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'Error interno al obtener productos de la categoría', 'detalle': str(e)}), 500

@categorias_bp.route('/estadisticas', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['CONTABLE'])
def estadisticas_categorias(current_user):
    """
    Obtiene estadísticas de categorías (cantidad de productos por categoría).
    """
    try:
        from sqlalchemy import func
        
        # Consulta para obtener cantidad de productos por categoría
        estadisticas = db.session.query(
            CategoriaProducto.id,
            CategoriaProducto.nombre,
            CategoriaProducto.activo,
            func.count(Producto.id).label('total_productos'),
            func.count(func.nullif(Producto.activo, False)).label('productos_activos')
        ).outerjoin(
            Producto, CategoriaProducto.id == Producto.categoria_id
        ).group_by(
            CategoriaProducto.id, CategoriaProducto.nombre, CategoriaProducto.activo
        ).order_by(
            CategoriaProducto.nombre.asc()
        ).all()
        
        # Productos sin categoría
        productos_sin_categoria = Producto.query.filter_by(categoria_id=None).count()
        productos_sin_categoria_activos = Producto.query.filter_by(categoria_id=None, activo=True).count()
        
        resultado = []
        for stat in estadisticas:
            resultado.append({
                'categoria_id': stat.id,
                'categoria_nombre': stat.nombre,
                'categoria_activa': stat.activo,
                'total_productos': stat.total_productos,
                'productos_activos': stat.productos_activos
            })
        
        # Agregar productos sin categoría
        if productos_sin_categoria > 0:
            resultado.append({
                'categoria_id': None,
                'categoria_nombre': 'Sin Categoría',
                'categoria_activa': True,
                'total_productos': productos_sin_categoria,
                'productos_activos': productos_sin_categoria_activos
            })
        
        return jsonify({
            'estadisticas': resultado,
            'total_categorias': len([r for r in resultado if r['categoria_id'] is not None])
        })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'Error interno al obtener estadísticas', 'detalle': str(e)}), 500