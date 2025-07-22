# app/blueprints/productos.py

# ... (tus importaciones existentes se mantienen, añade estas)
from flask import send_file
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment
from io import BytesIO # Para crear el archivo en memoria

# ... (tu blueprint productos_bp y todas las funciones existentes como calculate_price,
#      _get_unit_price, redondear_a_siguiente_decena, etc. se mantienen igual) ...


# --- NUEVO ENDPOINT PARA EXPORTAR LISTA DE PRECIOS ---

@productos_bp.route('/exportar_lista_precios', methods=['GET'])
def exportar_lista_precios_excel():
    """
    Genera y devuelve un archivo Excel con la lista de precios de todos los productos
    para un conjunto predefinido de cantidades.
    """
    try:
        # --- 1. Definir las cantidades a calcular ---
        # Usamos strings porque es lo que `calculate_price` espera
        cantidades_a_calcular = [
            "0.1", "0.25", "0.5", "0.75", 
            "1", "5", "10", "20", "50", "100", "200", "500", "1000"
        ]

        # --- 2. Preparar el archivo Excel en memoria ---
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Lista de Precios"

        # --- 3. Escribir las cabeceras ---
        cabeceras = ["ID/Cód.", "Nombre Producto", "Unidad Venta"]
        for qty in cantidades_a_calcular:
            cabeceras.append(f"Precio x {qty}")
        
        sheet.append(cabeceras)
        
        # Estilo para las cabeceras
        header_font = Font(bold=True)
        for cell in sheet[1]:
            cell.font = header_font
            cell.alignment = Alignment(horizontal='center')

        # --- 4. Iterar sobre todos los productos ---
        productos = Producto.query.order_by(Producto.nombre).all()
        print(f"INFO [export_excel]: Procesando {len(productos)} productos para la lista de precios...")

        for producto in productos:
            fila_producto = [
                producto.id,
                producto.nombre,
                producto.unidad_venta or "N/A"
            ]

            # --- 5. Calcular el precio para cada cantidad ---
            for qty_str in cantidades_a_calcular:
                precio_calculado_str = "Error" # Valor por defecto si falla el cálculo
                try:
                    # Crear un payload falso para simular la petición a calculate_price
                    # Es importante que las funciones internas no dependan directamente del objeto 'request'
                    # Vamos a reutilizar la lógica de _get_unit_price
                    cantidad_decimal_actual = Decimal(qty_str)
                    
                    # Llamar a la lógica de cálculo de precio unitario
                    precio_unitario_bruto, _, _ = _get_unit_price(
                        producto=producto,
                        cantidad_decimal=cantidad_decimal_actual,
                        cliente=None # Calcular precio de lista (sin cliente específico)
                    )
                    
                    if precio_unitario_bruto is not None:
                        # Aplicar redondeo
                        precio_unitario_redondeado = redondear_a_siguiente_decena(precio_unitario_bruto)
                        # Calcular precio total para esa cantidad específica
                        precio_total_para_cantidad = (precio_unitario_redondeado * cantidad_decimal_actual).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                        # Formatear para Excel
                        precio_calculado_str = f"{precio_total_para_cantidad:.2f}"
                    else:
                        precio_calculado_str = "No Disp."

                except ValueError as e:
                    # Si el cálculo falla para una cantidad (ej. no hay coeficiente), lo registramos
                    print(f"WARN [export_excel]: No se pudo calcular precio para Prod ID {producto.id}, Cantidad {qty_str}. Error: {e}")
                    precio_calculado_str = "No Coef."
                except Exception as e:
                    print(f"ERROR [export_excel]: Excepción inesperada para Prod ID {producto.id}, Cantidad {qty_str}. Error: {e}")
                    traceback.print_exc()
                    precio_calculado_str = "Error Calc"
                
                fila_producto.append(precio_calculado_str)

            # Escribir la fila completa del producto en la hoja de Excel
            sheet.append(fila_producto)
        
        # Ajustar ancho de columnas para mejor visualización
        for col in sheet.columns:
            max_length = 0
            column = col[0].column_letter # Obtener la letra de la columna
            for cell in col:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = (max_length + 2)
            sheet.column_dimensions[column].width = adjusted_width

        # --- 6. Guardar el libro de trabajo en un stream de bytes en memoria ---
        excel_stream = BytesIO()
        workbook.save(excel_stream)
        excel_stream.seek(0) # Mover el cursor al principio del stream

        print("INFO [export_excel]: Archivo Excel generado, enviando al cliente.")

        # --- 7. Devolver el archivo como una respuesta HTTP ---
        return send_file(
            excel_stream,
            as_attachment=True,
            download_name='lista_de_precios_quimex.xlsx',
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )

    except Exception as e:
        print(f"ERROR GRAVE [export_excel]: Fallo al generar el archivo Excel.")
        traceback.print_exc()
        return jsonify({"error": "No se pudo generar el archivo de lista de precios", "detalle": str(e)}), 500