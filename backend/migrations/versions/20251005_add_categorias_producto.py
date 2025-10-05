"""Agregar tabla categorias_producto y relacion con productos

Revision ID: 20251005_categorias
Revises: 20250918_add_precio_base_to_precios_especiales
Create Date: 2025-10-05 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime

# revision identifiers, used by Alembic.
revision = '20251005_categorias'
down_revision = '20250918_add_precio_base_to_precios_especiales'
branch_labels = None
depends_on = None


def upgrade():
    # Crear tabla categorias_producto
    op.create_table('categorias_producto',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.String(100), nullable=False),
        sa.Column('descripcion', sa.String(255), nullable=True),
        sa.Column('activo', sa.Boolean(), nullable=False),
        sa.Column('fecha_creacion', sa.DateTime(), nullable=True),
        sa.Column('fecha_modificacion', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('nombre')
    )
    
    # Crear índices
    op.create_index(op.f('ix_categorias_producto_nombre'), 'categorias_producto', ['nombre'], unique=False)
    op.create_index(op.f('ix_categorias_producto_activo'), 'categorias_producto', ['activo'], unique=False)
    
    # Agregar columna categoria_id a la tabla productos
    op.add_column('productos', sa.Column('categoria_id', sa.Integer(), nullable=True))
    
    # Crear índice para categoria_id
    op.create_index(op.f('ix_productos_categoria_id'), 'productos', ['categoria_id'], unique=False)
    
    # Crear foreign key constraint
    op.create_foreign_key('fk_productos_categoria_id', 'productos', 'categorias_producto', ['categoria_id'], ['id'], ondelete='SET NULL')
    
    # Insertar categorías por defecto
    categorias_default = [
        {'nombre': 'General', 'descripcion': 'Categoría general por defecto', 'activo': True},
        {'nombre': 'Materias Primas', 'descripcion': 'Materias primas químicas', 'activo': True},
        {'nombre': 'Productos Terminados', 'descripcion': 'Productos químicos terminados', 'activo': True},
        {'nombre': 'Recetas', 'descripcion': 'Productos que son recetas/fórmulas', 'activo': True}
    ]
    
    # Insertar las categorías por defecto
    from sqlalchemy import text
    connection = op.get_bind()
    for cat in categorias_default:
        connection.execute(text("""
            INSERT INTO categorias_producto (nombre, descripcion, activo, fecha_creacion, fecha_modificacion)
            VALUES (:nombre, :descripcion, :activo, NOW(), NOW())
        """), cat)


def downgrade():
    # Eliminar foreign key constraint
    op.drop_constraint('fk_productos_categoria_id', 'productos', type_='foreignkey')
    
    # Eliminar índice
    op.drop_index(op.f('ix_productos_categoria_id'), table_name='productos')
    
    # Eliminar columna categoria_id de productos
    op.drop_column('productos', 'categoria_id')
    
    # Eliminar índices de categorias_producto
    op.drop_index(op.f('ix_categorias_producto_activo'), table_name='categorias_producto')
    op.drop_index(op.f('ix_categorias_producto_nombre'), table_name='categorias_producto')
    
    # Eliminar tabla categorias_producto
    op.drop_table('categorias_producto')