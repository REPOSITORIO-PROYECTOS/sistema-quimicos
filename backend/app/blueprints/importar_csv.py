from flask import Blueprint, request, jsonify
import csv
from decimal import Decimal, InvalidOperation
from datetime import datetime

from app.models import Producto  # Importa el modelo Producto
from app import db              # Importa la instancia db

import_csv_bp = Blueprint('import_csv', __name__, url_prefix='/import_csv')

@import_csv_bp.route('/generar_sql', methods=['POST'])
def generar_sql_desde_csv():
    """
    Recibe un archivo CSV (multipart/form-data, campo 'csvFile'), procesa y actualiza productos en la base de datos.
    """
    if 'csvFile' not in request.files:
        return jsonify({"error": "No se envió archivo CSV (campo 'csvFile')"}), 400

    archivo_csv = request.files['csvFile']
    if archivo_csv.filename == '':
        return jsonify({"error": "Nombre de archivo vacío"}), 400

    try:
        contenido = archivo_csv.read().decode('latin-1')
        lector_csv = csv.DictReader(contenido.splitlines(), delimiter=';')

        if 'nombre_producto' not in lector_csv.fieldnames or 'nuevo_costo_usd' not in lector_csv.fieldnames:
            return jsonify({
                "error": "El archivo CSV debe tener las columnas 'nombre_producto' y 'nuevo_costo_usd' separadas por ';'.",
                "columnas_encontradas": lector_csv.fieldnames
            }), 400

        errores = []
        productos_procesados = 0
        productos_actualizados = 0

        for i, fila in enumerate(lector_csv):
            productos_procesados += 1
            nombre_producto_csv = fila.get('nombre_producto', '').strip()
            nuevo_costo_usd_str = fila.get('nuevo_costo_usd', '').strip()

            if not nombre_producto_csv:
                errores.append(f"Línea {i+2}: Nombre del producto vacío. Se omite.")
                continue

            if not nuevo_costo_usd_str:
                errores.append(f"Línea {i+2}: Costo USD vacío para '{nombre_producto_csv}'. Se omite.")
                continue

            try:
                nuevo_costo_usd = Decimal(nuevo_costo_usd_str.replace(',', '.'))
                if nuevo_costo_usd < Decimal('0'):
                    errores.append(f"Línea {i+2}: Costo USD negativo ({nuevo_costo_usd_str}) para '{nombre_producto_csv}'. Se omite.")
                    continue
            except InvalidOperation:
                errores.append(f"Línea {i+2}: Costo USD inválido ('{nuevo_costo_usd_str}') para '{nombre_producto_csv}'. Se omite.")
                continue

            # Busca el producto por nombre (ajusta si el nombre no es único)
            producto = Producto.query.filter(Producto.nombre == nombre_producto_csv).first()
            if not producto:
                errores.append(f"Línea {i+2}: Producto '{nombre_producto_csv}' no encontrado en la base de datos. Se omite.")
                continue

            producto.costo_referencia_usd = nuevo_costo_usd
            producto.fecha_actualizacion_costo = datetime.now()
            productos_actualizados += 1

        db.session.commit()

        return jsonify({
            "mensaje": f"Actualización completada.",
            "productos_procesados": productos_procesados,
            "productos_actualizados": productos_actualizados,
            "errores": errores
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Error procesando el archivo: {str(e)}"}), 500





# import csv
# from decimal import Decimal, InvalidOperation
# from datetime import datetime # Movido al principio porque se usa en la función

# # --- CONFIGURACIÓN ---
# NOMBRE_ARCHIVO_CSV = 'nuevos_costos_usd.csv'
# NOMBRE_TABLA_PRODUCTOS = 'productos'
# COLUMNA_NOMBRE_PRODUCTO_DB = 'nombre'
# COLUMNA_COSTO_USD_DB = 'costo_referencia_usd'
# NOMBRE_ARCHIVO_SQL_SALIDA = 'actualizar_costos.sql'

# def generar_comandos_sql():
#     comandos_sql = []
#     errores = []
#     productos_procesados = 0
#     productos_actualizados = 0

#     try:
#         # Prueba primero con 'latin-1' o 'windows-1252' si 'utf-8' falla con caracteres especiales
#         with open(NOMBRE_ARCHIVO_CSV, mode='r', encoding='latin-1') as archivo_csv: # O 'windows-1252' o 'utf-8' si estás seguro
            
#             lector_csv = csv.DictReader(archivo_csv, delimiter=';') 
            
#             # Verificar que las columnas esperadas existan después de especificar el delimitador
#             if 'nombre_producto' not in lector_csv.fieldnames or \
#                'nuevo_costo_usd' not in lector_csv.fieldnames:
#                 print(f"ERROR: El archivo CSV debe tener las columnas 'nombre_producto' y 'nuevo_costo_usd' separadas por ';'.")
#                 print(f"Columnas encontradas después de usar delimitador ';': {lector_csv.fieldnames}")
#                 return

#             for i, fila in enumerate(lector_csv):
#                 productos_procesados += 1
#                 nombre_producto_csv = fila.get('nombre_producto', '').strip()
#                 nuevo_costo_usd_str = fila.get('nuevo_costo_usd', '').strip()

#                 if not nombre_producto_csv:
#                     errores.append(f"Línea {i+2}: Nombre del producto vacío. Se omite.")
#                     continue

#                 if not nuevo_costo_usd_str:
#                     errores.append(f"Línea {i+2}: Costo USD vacío para '{nombre_producto_csv}'. Se omite.")
#                     continue
                
#                 try:
#                     nuevo_costo_usd = Decimal(nuevo_costo_usd_str.replace(',', '.')) # Reemplazar coma por punto si los costos usan coma decimal
#                     if nuevo_costo_usd < Decimal('0'):
#                         errores.append(f"Línea {i+2}: Costo USD negativo ({nuevo_costo_usd_str}) para '{nombre_producto_csv}'. Se omite.")
#                         continue
#                 except InvalidOperation:
#                     errores.append(f"Línea {i+2}: Costo USD inválido ('{nuevo_costo_usd_str}') para '{nombre_producto_csv}'. Se omite.")
#                     continue

#                 nombre_producto_sql = nombre_producto_csv.replace("'", "''")
                
#                 sql_command = f"UPDATE {NOMBRE_TABLA_PRODUCTOS} " \
#                               f"SET {COLUMNA_COSTO_USD_DB} = {nuevo_costo_usd:.4f} " \
#                               f"WHERE {COLUMNA_NOMBRE_PRODUCTO_DB} = '{nombre_producto_sql}';"
#                 comandos_sql.append(sql_command)
#                 productos_actualizados +=1

#     except FileNotFoundError:
#         print(f"ERROR: No se encontró el archivo CSV '{NOMBRE_ARCHIVO_CSV}'.")
#         return
#     except Exception as e:
#         print(f"Ocurrió un error inesperado al procesar el CSV: {e}")
#         import traceback
#         traceback.print_exc() # Imprimir el traceback completo para depuración
#         return

#     if comandos_sql:
#         try:
#             with open(NOMBRE_ARCHIVO_SQL_SALIDA, mode='w', encoding='utf-8') as archivo_sql:
#                 archivo_sql.write("-- Comandos SQL generados para actualizar costos USD de productos\n")
#                 archivo_sql.write(f"-- Fecha de generación: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
#                 archivo_sql.write(f"-- Total de productos procesados del CSV: {productos_procesados}\n")
#                 archivo_sql.write(f"-- Total de comandos UPDATE generados: {productos_actualizados}\n\n")
                
#                 for comando in comandos_sql:
#                     archivo_sql.write(comando + "\n")

#             print(f"Se generaron {len(comandos_sql)} comandos SQL en el archivo '{NOMBRE_ARCHIVO_SQL_SALIDA}'.")
#         except Exception as e:
#             print(f"Ocurrió un error al escribir el archivo SQL: {e}")

#     if errores:
#         print("\nSe encontraron los siguientes errores o advertencias durante el procesamiento:")
#         for error in errores:
#             print(f"- {error}")
    
#     if not comandos_sql and not errores and productos_procesados == 0: # Si no hay errores pero tampoco comandos y no se procesó nada.
#         print("No se procesaron filas del CSV. ¿Está vacío o en un formato inesperado después de la cabecera?")
#     elif not comandos_sql and not errores and productos_procesados > 0: # Si se procesaron filas pero ninguna generó SQL (ej. todas con errores de datos)
#         print("Se procesaron filas del CSV pero ninguna resultó en un comando SQL válido debido a errores en los datos.")


# if __name__ == "__main__":
#     generar_comandos_sql()