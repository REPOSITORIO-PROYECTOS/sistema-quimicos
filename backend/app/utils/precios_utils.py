from decimal import Decimal, InvalidOperation
import traceback

def calculate_price(product_id: int, quantity, cliente_id=None, db=None):
    """
    Lógica de cálculo de precio exportable para uso en otros blueprints.
    Devuelve un dict con los resultados y errores.
    """
    debug_info_response = {"etapas_calculo": []}
    detalles_calculo_dinamico = {}
    try:
        if db is None:
            raise ValueError("Se debe pasar la instancia de db como argumento.")
        from app.models import Producto, PrecioEspecialCliente, TipoCambio
        from app.blueprints.productos import calcular_costo_producto_referencia, obtener_coeficiente_por_rango, redondear_a_siguiente_decena, redondear_a_siguiente_centena
        producto = db.session.get(Producto, product_id)
        if not producto:
            return {"status": "error", "message": "Producto no encontrado"}
        cantidad_decimal = Decimal(str(quantity))
        if cantidad_decimal <= Decimal('0'):
            raise ValueError("La cantidad debe ser positiva.")
        # --- PRIORIDAD 1: PRECIO ESPECIAL ---
        precio_venta_unitario_bruto = None
        se_aplico_precio_especial = False
        if cliente_id:
            try:
                precio_especial_db = db.session.query(PrecioEspecialCliente).filter_by(cliente_id=cliente_id, producto_id=product_id, activo=True).first()
                if precio_especial_db and precio_especial_db.precio_unitario_fijo_ars is not None:
                    precio_venta_unitario_bruto = Decimal(str(precio_especial_db.precio_unitario_fijo_ars))
                    se_aplico_precio_especial = True
                    debug_info_response['etapas_calculo'].append("INICIO: LÓGICA DE PRECIO ESPECIAL APLICADA.")
            except (ValueError, TypeError):
                debug_info_response['etapas_calculo'].append("WARN: Cliente ID inválido, se ignora.")
        # --- OBTENER VALORES BASE SIEMPRE (para respuesta completa) ---
        costo_unitario_venta_usd = calcular_costo_producto_referencia(product_id)
        nombre_tc = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
        tc_obj = TipoCambio.query.filter_by(nombre=nombre_tc).first()
        if not tc_obj or tc_obj.valor <= 0:
            raise ValueError(f"TC '{nombre_tc}' inválido.")
        costo_unitario_venta_ars = costo_unitario_venta_usd * tc_obj.valor
        
        # --- CÁLCULO DINÁMICO ---
        if not se_aplico_precio_especial:
            debug_info_response['etapas_calculo'].append("INICIO: CÁLCULO DINÁMICO")
            margen = Decimal(str(producto.margen or '0.0'))
            if not (Decimal('0') <= margen < Decimal('1')):
                raise ValueError("Margen inválido.")
            precio_base_ars = costo_unitario_venta_ars / (Decimal('1') - margen)
            detalles_calculo_dinamico['A_COSTO_UNITARIO_USD'] = f"{costo_unitario_venta_usd:.4f}"
            detalles_calculo_dinamico['B_PRECIO_BASE_ARS_CON_MARGEN'] = f"{precio_base_ars:.4f}"
            debug_info_response['etapas_calculo'].append(f"1. Precio Base ARS (unitario, con margen): {precio_base_ars.quantize(Decimal('0.01'))}")
            resultado_tabla = obtener_coeficiente_por_rango(str(producto.ref_calculo or ''), str(cantidad_decimal), producto.tipo_calculo)
            if resultado_tabla is None:
                raise ValueError("No se encontró coeficiente en la matriz.")
            coeficiente_str, escalon_cantidad_str = resultado_tabla
            if not coeficiente_str or coeficiente_str.strip() == '':
                raise ValueError("Producto no disponible en esta cantidad.")
            coeficiente_decimal = Decimal(coeficiente_str)
            detalles_calculo_dinamico['C_COEFICIENTE_DE_MATRIZ'] = f"{coeficiente_decimal}"
            detalles_calculo_dinamico['D_ESCALON_CANTIDAD_MATRIZ'] = escalon_cantidad_str
            debug_info_response['etapas_calculo'].append(f"2. Coeficiente para Qty {cantidad_decimal} es: {coeficiente_decimal} (del tier <= {escalon_cantidad_str})")
            if cantidad_decimal >= Decimal('1.0'):
                precio_venta_unitario_bruto = precio_base_ars * coeficiente_decimal
                debug_info_response['etapas_calculo'].append(f"3. [Cant >= 1] P. Venta Unitario Bruto (P.Base * Coef): {precio_venta_unitario_bruto:.4f}")
            else:
                precio_para_la_fraccion = precio_base_ars * coeficiente_decimal
                escalon_decimal = Decimal(escalon_cantidad_str)
                if escalon_decimal == Decimal('0'):
                    raise ValueError("El escalón de la matriz no puede ser cero.")
                precio_venta_unitario_bruto = precio_para_la_fraccion / escalon_decimal
                debug_info_response['etapas_calculo'].append(f"3. [Cant < 1] P. Venta Unitario Bruto ((P.Base * Coef) / Escalón): {precio_venta_unitario_bruto:.4f}")
            detalles_calculo_dinamico['E_PRECIO_VENTA_UNITARIO_BRUTO'] = f"{precio_venta_unitario_bruto:.4f}"
        if precio_venta_unitario_bruto is None:
            raise ValueError("Fallo en la lógica: no se pudo determinar un precio.")
        precio_venta_unitario_redondeado = redondear_a_siguiente_decena(precio_venta_unitario_bruto)
        precio_total_final_ars = redondear_a_siguiente_centena(precio_venta_unitario_redondeado * cantidad_decimal)
        detalles_calculo_dinamico['F_PRECIO_UNITARIO_REDONDEADO'] = f"{precio_venta_unitario_redondeado:.2f}"
        detalles_calculo_dinamico['G_PRECIO_TOTAL_FINAL_REDONDEADO'] = f"{precio_total_final_ars:.2f}"
        debug_info_response['etapas_calculo'].append(f"4. Redondeo Final (Unitario): {precio_venta_unitario_bruto:.4f} -> {precio_venta_unitario_redondeado}")
        debug_info_response['etapas_calculo'].append(f"5. Total Final: {precio_venta_unitario_redondeado * cantidad_decimal:.2f} -> {precio_total_final_ars}")
        return {
            "status": "success",
            "product_id_solicitado": product_id,
            "cantidad_solicitada": float(cantidad_decimal),
            "es_precio_especial": se_aplico_precio_especial,
            "precio_venta_unitario_ars": float(precio_venta_unitario_redondeado),
            "precio_unitario_ars": float(precio_venta_unitario_redondeado),  # Alias para compatibilidad
            "precio_total_calculado_ars": float(precio_total_final_ars),
            "costo_unitario_usd": float(costo_unitario_venta_usd),
            "costo_unitario_ars": float(costo_unitario_venta_ars),
            "tipo_cambio_usado": float(tc_obj.valor),
            "debug_info_completo": {
                "resumen_pasos": debug_info_response["etapas_calculo"],
                "desglose_variables": detalles_calculo_dinamico if not se_aplico_precio_especial else None
            }
        }
    except (ValueError, InvalidOperation) as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        traceback.print_exc()
        return {"status": "error", "message": "Error interno del servidor."}