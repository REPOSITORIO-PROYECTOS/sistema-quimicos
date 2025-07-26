# app/blueprints/reportes.py

from os import sendfile
from flask import Blueprint, request, jsonify, make_response, current_app
from sqlalchemy.orm import selectinload
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP, ROUND_CEILING
import datetime
import traceback
import io

# Importar la librería para Excel
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.utils import get_column_letter

# --- Imports locales ---
from .. import db
from ..models import Venta, OrdenCompra
from ..models import Producto, TipoCambio
from ..calculator.core import obtener_coeficiente_por_rango
from .productos import calcular_costo_producto_referencia, redondear_a_siguiente_decena
from ..utils.decorators import token_required, roles_required
from ..utils.permissions import ROLES

# --- Blueprint ---
reportes_bp = Blueprint('reportes', __name__, url_prefix='/reportes')

# --- CONFIGURACIÓN DE LÍMITES ---
# Límite máximo de días para el reporte para proteger el servidor.
# Puedes ajustar este valor según la performance de tu servidor.
MAX_REPORT_DAYS = 180 

# --- Estilos para el Excel ---
HEADER_FONT = Font(bold=True, color="FFFFFF")
HEADER_FILL = PatternFill(start_color="4F81BD", end_color="4F81BD", fill_type="solid")

def style_header(ws, headers):
    for i, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=i)
        cell.value = header
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        column_letter = get_column_letter(i)
        ws.column_dimensions[column_letter].width = max(len(header) + 5, 18)


# --- Endpoint Único para Generar Reporte con Límites ---
@reportes_bp.route('/movimientos-excel', methods=['GET'])
@token_required
@roles_required(ROLES['ADMIN'], ROLES['CONTABLE'])
def reporte_movimientos_excel_limitado(current_user):
    """
    Genera un reporte de ventas y compras en Excel, con un rango de fechas
    obligatorio y limitado para proteger la memoria del servidor.
    """
    # --- 1. Validar el rango de fechas ---
    fecha_desde_str = request.args.get('fecha_desde')
    fecha_hasta_str = request.args.get('fecha_hasta')

    if not fecha_desde_str or not fecha_hasta_str:
        return jsonify({"error": "Los parámetros 'fecha_desde' y 'fecha_hasta' son requeridos."}), 400

    try:
        fecha_desde = datetime.date.fromisoformat(fecha_desde_str)
        fecha_hasta = datetime.date.fromisoformat(fecha_hasta_str)
        
        # Validación de la duración del rango
        delta = fecha_hasta - fecha_desde
        if delta.days < 0:
            return jsonify({"error": "'fecha_hasta' no puede ser anterior a 'fecha_desde'."}), 400
        if delta.days > MAX_REPORT_DAYS:
            return jsonify({"error": f"El rango de fechas solicitado excede el límite máximo de {MAX_REPORT_DAYS} días. Por favor, seleccione un período más corto."}), 400
            
        # Definir los rangos de fecha y hora para las consultas
        start_datetime = datetime.datetime.combine(fecha_desde, datetime.time.min)
        end_datetime = datetime.datetime.combine(fecha_hasta + datetime.timedelta(days=1), datetime.time.min)
    except ValueError:
        return jsonify({"error": "Formato de fecha inválido. Use YYYY-MM-DD."}), 400

    try:
        # --- 2. Crear el libro de Excel ---
        workbook = openpyxl.Workbook()
        
        # --- Hoja de Ventas ---
        ws_ventas = workbook.active
        ws_ventas.title = "Ventas"
        headers_ventas = [
            "ID Venta", "Fecha", "Cliente", "Vendedor", "Monto Base (ARS)", 
            "Monto Final (ARS)", "Forma de Pago", "Factura"
        ]
        style_header(ws_ventas, headers_ventas)
        
        query_ventas = Venta.query.options(
            selectinload(Venta.usuario_interno), selectinload(Venta.cliente)
        ).filter(
            Venta.fecha_registro >= start_datetime, Venta.fecha_registro < end_datetime
        ).order_by(Venta.fecha_registro.asc())
        
        for row_num, venta in enumerate(query_ventas.all(), 2):
            ws_ventas.cell(row=row_num, column=1, value=venta.id)
            ws_ventas.cell(row=row_num, column=2, value=venta.fecha_registro.strftime('%Y-%m-%d %H:%M'))
            ws_ventas.cell(row=row_num, column=3, value=venta.cliente.nombre_razon_social if venta.cliente else "Consumidor Final")
            ws_ventas.cell(row=row_num, column=4, value=f"{venta.usuario_interno.nombre} {venta.usuario_interno.apellido}" if venta.usuario_interno else venta.nombre_vendedor)
            ws_ventas.cell(row=row_num, column=5, value=float(venta.monto_total or 0)).number_format = '#,##0.00'
            ws_ventas.cell(row=row_num, column=6, value=float(venta.monto_final_con_recargos or 0)).number_format = '#,##0.00'
            ws_ventas.cell(row=row_num, column=7, value=venta.forma_pago)
            ws_ventas.cell(row=row_num, column=8, value="Sí" if venta.requiere_factura else "No")

        # --- Hoja de Compras ---
        ws_compras = workbook.create_sheet("Compras")
        headers_compras = [
            "ID Compra", "Nro Solicitud", "Fecha Creación", "Fecha Recepción", "Proveedor",
            "Monto Total (ARS)", "Monto Pagado (ARS)", "Monto Pendiente (ARS)", "Estado Pago"
        ]
        style_header(ws_compras, headers_compras)

        query_compras = OrdenCompra.query.options(
            selectinload(OrdenCompra.proveedor)
        ).filter(
            OrdenCompra.fecha_creacion >= start_datetime, OrdenCompra.fecha_creacion < end_datetime
        ).order_by(OrdenCompra.fecha_creacion.asc())

        for row_num, compra in enumerate(query_compras.all(), 2):
            monto_total = compra.importe_total_estimado or Decimal("0.0")
            monto_pagado = compra.importe_abonado or Decimal("0.0")
            monto_pendiente = monto_total - monto_pagado
            estado_pago = "Pagada" if monto_pendiente <= 0 and monto_total > 0 else ("Parcial" if monto_pagado > 0 else "Pendiente")
            
            ws_compras.cell(row=row_num, column=1, value=compra.id)
            ws_compras.cell(row=row_num, column=2, value=compra.nro_solicitud_interno)
            ws_compras.cell(row=row_num, column=3, value=compra.fecha_creacion.strftime('%Y-%m-%d %H:%M') if compra.fecha_creacion else '')
            ws_compras.cell(row=row_num, column=4, value=compra.fecha_recepcion.strftime('%Y-%m-%d %H:%M') if compra.fecha_recepcion else '')
            ws_compras.cell(row=row_num, column=5, value=compra.proveedor.nombre if compra.proveedor else "N/A")
            ws_compras.cell(row=row_num, column=6, value=float(monto_total)).number_format = '#,##0.00'
            ws_compras.cell(row=row_num, column=7, value=float(monto_pagado)).number_format = '#,##0.00'
            ws_compras.cell(row=row_num, column=8, value=float(monto_pendiente)).number_format = '#,##0.00'
            ws_compras.cell(row=row_num, column=9, value=estado_pago)

        # --- 3. Generar respuesta con el archivo Excel ---
        excel_buffer = io.BytesIO()
        workbook.save(excel_buffer)
        excel_buffer.seek(0)

        nombre_archivo = f"Reporte_Movimientos_{fecha_desde_str}_a_{fecha_hasta_str}.xlsx"
        response = make_response(excel_buffer.read())
        response.headers['Content-Disposition'] = f'attachment; filename="{nombre_archivo}"'
        response.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        
        return response

    except Exception as e:
        print(f"ERROR [reporte_movimientos_excel]: Excepción inesperada")
        traceback.print_exc()
        return jsonify({"error": "Error interno al generar el reporte Excel."}), 500
    
@reportes_bp.route('/lista_precios/excel', methods=['GET'])
@token_required # Asegúrate de proteger este endpoint
def exportar_lista_precios_excel(current_user):
    """
    Genera un Excel con la lista de precios LLAMANDO al endpoint 'calculate_price'
    para garantizar 100% de consistencia en la lógica.
    """
    try:
        cantidades_a_calcular = [ "0.1", "0.25", "0.5", "1", "5", "10", "20", "50", "100", "200", "500", "1000" ]
        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.title = "Lista de Precios"

        cabeceras = ["ID/Cód.", "Nombre Producto", "Costo Ref. USD (Unitario)"] + [f"Total x {qty}" for qty in cantidades_a_calcular]
        style_header(sheet, cabeceras) # Asumiendo que esta función existe
        
        productos = Producto.query.order_by(Producto.nombre).all()
        
        # --- CREAMOS UN CLIENTE DE PRUEBAS PARA LLAMAR A NUESTRA PROPIA API ---
        with current_app.test_client() as client:
            for row_num, producto in enumerate(productos, 2):
                sheet.cell(row=row_num, column=1, value=producto.id)
                sheet.cell(row=row_num, column=2, value=producto.nombre)
                
                try:
                    # Obtenemos el costo una vez por producto (esto no cambia)
                    costo_unitario_usd = calcular_costo_producto_referencia(producto.id)
                    sheet.cell(row=row_num, column=3, value=float(costo_unitario_usd)).number_format = '"$"#,##0.0000'

                    # Iteramos por cada cantidad y llamamos al endpoint /calcular_precio
                    for col_num_offset, qty_str in enumerate(cantidades_a_calcular):
                        current_col = 4 + col_num_offset
                        cell = sheet.cell(row=row_num, column=current_col)
                        
                        # Preparamos el payload para la petición interna
                        payload = {"quantity": qty_str}
                        
                        # Hacemos la llamada al endpoint
                        response = client.post(
                            f'/productos/calcular_precio/{producto.id}',
                            json=payload
                        )
                        
                        if response.status_code == 200:
                            # Si la llamada fue exitosa, extraemos el precio total
                            data = response.get_json()
                            precio_total = data.get('precio_total_calculado_ars')
                            cell.value = float(precio_total) if precio_total is not None else "N/A"
                            cell.number_format = '"$"#,##0.00'
                        else:
                            # Si la llamada falló, lo reportamos en la celda
                            error_data = response.get_json()
                            error_message = error_data.get('message', 'Error desconocido')
                            print(f"WARN [export_excel]: Fallo en API para Prod ID {producto.id}, Qty {qty_str}. Msg: {error_message}")
                            cell.value = "Error API"
                
                except Exception as row_error:
                    print(f"WARN [export_excel]: Fila completa fallida para Prod ID {producto.id}. Error: {row_error}")
                    for col_num_offset, _ in enumerate(cantidades_a_calcular):
                        sheet.cell(row=row_num, column=4 + col_num_offset, value="Error")
        
        # --- Generar y Devolver el Archivo Excel (sin cambios) ---
        excel_buffer = io.BytesIO()
        workbook.save(excel_buffer)
        excel_buffer.seek(0)
        # ... (código para crear y devolver la respuesta con el archivo) ...
        nombre_archivo = f"Lista_De_Precios_Quimex_{datetime.date.today().isoformat()}.xlsx"
        response = make_response(excel_buffer.read())
        response.headers['Content-Disposition'] = f'attachment; filename="{nombre_archivo}"'
        response.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        return response

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "No se pudo generar el archivo de lista de precios", "detalle": str(e)}), 500
    

# --- FUNCIÓN DE REDONDEO (COPIADA AQUÍ PARA USO LOCAL) ---
def redondear_a_siguiente_decena(valor_decimal: Decimal) -> Decimal:
    """Redondea un valor Decimal hacia arriba al siguiente múltiplo de 10."""
    if not isinstance(valor_decimal, Decimal):
        valor_decimal = Decimal(str(valor_decimal))
    valor_redondeado = valor_decimal.quantize(Decimal('10'), rounding=ROUND_CEILING)
    return valor_redondeado.quantize(Decimal("0.01"))


