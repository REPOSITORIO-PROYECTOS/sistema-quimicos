#!/usr/bin/env python3
"""
Script para analizar integridad de datos en quimex_db
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app, db
from sqlalchemy import text

app = create_app()

with app.app_context():
    print("\n" + "="*60)
    print("ANÁLISIS DE INTEGRIDAD DE DATOS - QUIMEX_DB")
    print("="*60 + "\n")
    
    # 1. Productos sin categoría
    resultado = db.session.execute(text("""
        SELECT COUNT(*) as count FROM productos 
        WHERE categoria_id IS NULL OR categoria_id NOT IN (SELECT id FROM categorias_producto)
    """)).fetchone()
    print(f"❌ PRODUCTOS SIN CATEGORÍA: {resultado[0]}")
    
    # 2. Productos duplicados
    resultado = db.session.execute(text("""
        SELECT nombre, COUNT(*) as count FROM productos 
        GROUP BY nombre HAVING count > 1
    """)).fetchall()
    print(f"❌ PRODUCTOS DUPLICADOS: {len(resultado)}")
    if resultado:
        for nombre, count in resultado:
            print(f"   - '{nombre}': {count} veces")
    
    # 3. Recetas sin producto final
    resultado = db.session.execute(text("""
        SELECT COUNT(*) as count FROM recetas 
        WHERE producto_final_id IS NULL OR producto_final_id NOT IN (SELECT id FROM productos)
    """)).fetchone()
    print(f"❌ RECETAS SIN PRODUCTO FINAL: {resultado[0]}")
    
    # 4. Recetas sin ingredientes
    resultado = db.session.execute(text("""
        SELECT id, COUNT(*) as count FROM receta_items 
        GROUP BY receta_id 
        ORDER BY count
    """)).fetchall()
    recetas_sin_items = sum(1 for _, count in resultado if count == 0)
    print(f"❌ RECETAS SIN INGREDIENTES: {recetas_sin_items}")
    
    # 5. Receta items sin ingrediente válido
    resultado = db.session.execute(text("""
        SELECT COUNT(*) as count FROM receta_items 
        WHERE ingrediente_id NOT IN (SELECT id FROM productos)
    """)).fetchone()
    print(f"❌ RECETA ITEMS CON INGREDIENTE INVÁLIDO: {resultado[0]}")
    
    # 6. Detalles venta sin venta
    resultado = db.session.execute(text("""
        SELECT COUNT(*) as count FROM detalles_venta 
        WHERE venta_id NOT IN (SELECT id FROM ventas)
    """)).fetchone()
    print(f"❌ DETALLES VENTA HUÉRFANOS: {resultado[0]}")
    
    # 7. Clientes duplicados por CUIT
    resultado = db.session.execute(text("""
        SELECT cuit, COUNT(*) as count FROM clientes 
        WHERE cuit IS NOT NULL 
        GROUP BY cuit HAVING count > 1
    """)).fetchall()
    print(f"❌ CLIENTES DUPLICADOS POR CUIT: {len(resultado)}")
    if resultado:
        for cuit, count in resultado[:5]:
            print(f"   - CUIT {cuit}: {count} veces")
    
    # 8. Órdenes compra sin proveedor
    resultado = db.session.execute(text("""
        SELECT COUNT(*) as count FROM ordenes_compra 
        WHERE proveedor_id NOT IN (SELECT id FROM proveedores)
    """)).fetchone()
    print(f"❌ ÓRDENES COMPRA HUÉRFANAS: {resultado[0]}")
    
    # 9. Status inconsistentes en ventas
    resultado = db.session.execute(text("""
        SELECT estado, COUNT(*) as count FROM ventas 
        GROUP BY estado
    """)).fetchall()
    print(f"\n📊 VENTAS POR ESTADO:")
    for estado, count in resultado:
        print(f"   - {estado}: {count}")
    
    # 10. Resumen general de datos
    print(f"\n📈 RESUMEN DE TABLAS:")
    tablas = [
        ('productos', 'Productos'),
        ('recetas', 'Recetas/Fórmulas'),
        ('receta_items', 'Ingredientes de recetas'),
        ('detalles_venta', 'Detalles de ventas'),
        ('ventas', 'Ventas'),
        ('clientes', 'Clientes'),
        ('ordenes_compra', 'Órdenes de compra'),
        ('categorias_producto', 'Categorías')
    ]
    
    for tabla, etiqueta in tablas:
        result = db.session.execute(text(f"SELECT COUNT(*) as count FROM {tabla}")).fetchone()
        print(f"   - {etiqueta}: {result[0]} registros")
    
    print("\n" + "="*60)
    print("✅ ANÁLISIS COMPLETADO")
    print("="*60 + "\n")
