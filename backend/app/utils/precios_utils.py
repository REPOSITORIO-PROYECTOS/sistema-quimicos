from decimal import Decimal, InvalidOperation
import traceback
import math

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
        # Imports relativos para evitar problemas de resolución (Pylance reportMissingImports)
        from ..models import Producto, PrecioEspecialCliente, TipoCambio  # type: ignore
        from ..blueprints.productos import (
            calcular_costo_producto_referencia,
            obtener_coeficiente_por_rango,
            redondear_a_siguiente_decena,
            redondear_a_siguiente_centena,
        )  # type: ignore
        producto = db.session.get(Producto, product_id)
        if not producto:
            return {"status": "error", "message": "Producto no encontrado"}
        cantidad_decimal = Decimal(str(quantity))
        if cantidad_decimal <= Decimal('0'):
            raise ValueError("La cantidad debe ser positiva.")
        # --- PRIORIDAD 1: PRECIO ESPECIAL ---
        precio_venta_unitario_bruto = None
        se_aplico_precio_especial = False
        precio_especial_db = None
        if cliente_id:
            try:
                precio_especial_db = db.session.query(PrecioEspecialCliente).filter_by(cliente_id=cliente_id, producto_id=product_id, activo=True).first()
            except (ValueError, TypeError):
                debug_info_response['etapas_calculo'].append("WARN: Cliente ID inválido, se ignora.")

        # Nota: diferimos aplicar precio especial hasta tener costo/base calculado, para soportar modo margen.
        # --- OBTENER VALORES BASE SIEMPRE (para respuesta completa) ---
        costo_unitario_venta_usd = calcular_costo_producto_referencia(product_id)
        debug_info_response['etapas_calculo'].append(f"DEBUG: Costo unitario USD = {costo_unitario_venta_usd}")
        
        if costo_unitario_venta_usd <= 0:
            raise ValueError(f"Costo unitario USD es cero o inválido: {costo_unitario_venta_usd}")
        
        nombre_tc = 'Oficial' if producto.ajusta_por_tc else 'Empresa'
        tc_obj = TipoCambio.query.filter_by(nombre=nombre_tc).first()
        debug_info_response['etapas_calculo'].append(f"DEBUG: TC {nombre_tc} = {tc_obj.valor if tc_obj else 'NO ENCONTRADO'}")
        
        if not tc_obj or tc_obj.valor <= 0:
            raise ValueError(f"TC '{nombre_tc}' inválido: {tc_obj.valor if tc_obj else 'no encontrado'}")
        
        costo_unitario_venta_ars = costo_unitario_venta_usd * tc_obj.valor
        debug_info_response['etapas_calculo'].append(f"DEBUG: Costo unitario ARS = {costo_unitario_venta_usd} * {tc_obj.valor} = {costo_unitario_venta_ars}")
        
        # --- PRECIO ESPECIAL (dos modos) ---
        if precio_especial_db is not None:
            if getattr(precio_especial_db, 'usar_precio_base', False):
                # Modo margen dinámico: recalcular base como en la rama dinámica y aplicar margen_sobre_base
                margen_especial = Decimal(str(precio_especial_db.margen_sobre_base or '0'))
                debug_info_response['etapas_calculo'].append(
                    f"INICIO: PRECIO ESPECIAL CON MARGEN (usar_precio_base=TRUE) margen={margen_especial * 100:.2f}%")
                # 1. Margen del producto (para reconstruir precio base de lista)
                margen_producto = Decimal(str(producto.margen or '0.0'))
                if not (Decimal('0') <= margen_producto < Decimal('1')):
                    raise ValueError(f"Margen de producto inválido: {margen_producto}")
                precio_base_ars = costo_unitario_venta_ars / (Decimal('1') - margen_producto)
                debug_info_response['etapas_calculo'].append(
                    f"DEBUG: Precio base ARS producto = costo {costo_unitario_venta_ars} / (1 - {margen_producto}) = {precio_base_ars}")
                # 2. Coeficiente matriz
                from ..blueprints.productos import obtener_coeficiente_por_rango  # type: ignore
                resultado_tabla = obtener_coeficiente_por_rango(str(producto.ref_calculo or ''), str(cantidad_decimal), producto.tipo_calculo)
                if resultado_tabla is None:
                    raise ValueError("No se encontró coeficiente para aplicar margen especial.")
                coeficiente_str, escalon_cantidad_str = resultado_tabla
                if not coeficiente_str or coeficiente_str.strip() == '':
                    raise ValueError("Coeficiente vacío para margen especial.")
                coeficiente_decimal = Decimal(coeficiente_str)
                debug_info_response['etapas_calculo'].append(
                    f"DEBUG: Coeficiente matriz = {coeficiente_decimal} (escalón {escalon_cantidad_str})")
                # 3. Precio dinámico base (como si fuera cálculo normal)
                if cantidad_decimal >= Decimal('1.0'):
                    precio_dinamico_base = precio_base_ars * coeficiente_decimal
                else:
                    escalon_decimal = Decimal(escalon_cantidad_str)
                    if escalon_decimal == 0:
                        raise ValueError("Escalón cero en margen especial.")
                    precio_dinamico_base = (precio_base_ars * coeficiente_decimal) / escalon_decimal
                debug_info_response['etapas_calculo'].append(
                    f"DEBUG: Precio dinámico base (sin margen especial) = {precio_dinamico_base}")
                # 4. Aplicar margen especial almacenado (interpreta margen_especial ya como fracción, ej 0.44 = 44%)
                if margen_especial < Decimal('-0.99'):
                    raise ValueError(f"Margen especial demasiado negativo: {margen_especial}")
                precio_venta_unitario_bruto = precio_dinamico_base * (Decimal('1') + margen_especial)
                if precio_venta_unitario_bruto <= 0:
                    raise ValueError("Resultado de precio especial con margen <= 0 (inconsistente)")
                se_aplico_precio_especial = True
                debug_info_response['etapas_calculo'].append(
                    f"DEBUG: Margen especial aplicado => Precio bruto especial = {precio_venta_unitario_bruto}")
                # Guardar desglose también para modo especial
                detalles_calculo_dinamico['A_COSTO_UNITARIO_USD'] = f"{costo_unitario_venta_usd:.4f}"
                detalles_calculo_dinamico['B_PRECIO_BASE_ARS_CON_MARGEN_PRODUCTO'] = f"{precio_base_ars:.4f}"
                detalles_calculo_dinamico['C_COEFICIENTE_DE_MATRIZ'] = f"{coeficiente_decimal}"
                detalles_calculo_dinamico['D_ESCALON_CANTIDAD_MATRIZ'] = escalon_cantidad_str
                detalles_calculo_dinamico['E_PRECIO_DINAMICO_BASE'] = f"{precio_dinamico_base:.4f}"
                detalles_calculo_dinamico['F_MARGEN_ESPECIAL_FRACCION'] = f"{margen_especial}"
                detalles_calculo_dinamico['G_PRECIO_BRUTO_ESPECIAL'] = f"{precio_venta_unitario_bruto:.4f}"
            else:
                # Modo precio especial fijo previo (compatibilidad)
                if precio_especial_db.precio_unitario_fijo_ars is not None:
                    precio_venta_unitario_bruto = Decimal(str(precio_especial_db.precio_unitario_fijo_ars))
                    if precio_venta_unitario_bruto <= 0:
                        raise ValueError("Precio especial fijo no puede ser <= 0")
                    se_aplico_precio_especial = True
                    debug_info_response['etapas_calculo'].append("INICIO: LÓGICA DE PRECIO ESPECIAL FIJO APLICADA.")

        # --- CÁLCULO DINÁMICO (si no hubo precio especial) ---
        if not se_aplico_precio_especial:
            debug_info_response['etapas_calculo'].append("INICIO: CÁLCULO DINÁMICO")
            margen = Decimal(str(producto.margen or '0.0'))
            debug_info_response['etapas_calculo'].append(f"DEBUG: Margen del producto = {margen}")
            
            if not (Decimal('0') <= margen < Decimal('1')):
                raise ValueError(f"Margen inválido: {margen} (debe estar entre 0 y 0.99)")
            
            precio_base_ars = costo_unitario_venta_ars / (Decimal('1') - margen)
            debug_info_response['etapas_calculo'].append(f"DEBUG: Precio base ARS = {costo_unitario_venta_ars} / (1 - {margen}) = {precio_base_ars}")
            detalles_calculo_dinamico['A_COSTO_UNITARIO_USD'] = f"{costo_unitario_venta_usd:.4f}"
            detalles_calculo_dinamico['B_PRECIO_BASE_ARS_CON_MARGEN'] = f"{precio_base_ars:.4f}"
            debug_info_response['etapas_calculo'].append(f"1. Precio Base ARS (unitario, con margen): {precio_base_ars.quantize(Decimal('0.01'))}")
            resultado_tabla = obtener_coeficiente_por_rango(str(producto.ref_calculo or ''), str(cantidad_decimal), producto.tipo_calculo)
            debug_info_response['etapas_calculo'].append(f"DEBUG: Búsqueda coeficiente - ref_calculo='{producto.ref_calculo}', cantidad={cantidad_decimal}, tipo='{producto.tipo_calculo}'")
            debug_info_response['etapas_calculo'].append(f"DEBUG: Resultado tabla = {resultado_tabla}")
            
            if resultado_tabla is None:
                raise ValueError(f"No se encontró coeficiente en la matriz para ref_calculo='{producto.ref_calculo}', cantidad={cantidad_decimal}, tipo='{producto.tipo_calculo}'")
            
            coeficiente_str, escalon_cantidad_str = resultado_tabla
            if not coeficiente_str or coeficiente_str.strip() == '':
                raise ValueError(f"Producto no disponible en esta cantidad. Coeficiente vacío: '{coeficiente_str}'")
            
            coeficiente_decimal = Decimal(coeficiente_str)
            debug_info_response['etapas_calculo'].append(f"DEBUG: Coeficiente decimal = {coeficiente_decimal}, escalón = {escalon_cantidad_str}")
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
        # --- REDONDEO (alineado con productos.calculate_price) ---
        # Regla vigente acordada:
        #  - Unitario: siempre se redondea hacia ARRIBA a la siguiente DECENA.
        #  - Total: si es precio especial => decena; si es precio estándar => centena.
        precio_venta_unitario_redondeado = redondear_a_siguiente_decena(precio_venta_unitario_bruto)
        tipo_redondeo_unitario = 'decena'
        if se_aplico_precio_especial:
            precio_total_final_ars = redondear_a_siguiente_decena(precio_venta_unitario_redondeado * cantidad_decimal)
            tipo_redondeo_total = 'decena'
            debug_info_response['etapas_calculo'].append("DEBUG: Redondeo total aplicado = decena (precio especial)")
        else:
            precio_total_final_ars = redondear_a_siguiente_centena(precio_venta_unitario_redondeado * cantidad_decimal)
            tipo_redondeo_total = 'centena'
            debug_info_response['etapas_calculo'].append("DEBUG: Redondeo total aplicado = centena (precio estándar)")
        detalles_calculo_dinamico['F_PRECIO_UNITARIO_REDONDEADO'] = f"{precio_venta_unitario_redondeado:.2f}"
        detalles_calculo_dinamico['G_PRECIO_TOTAL_FINAL_REDONDEADO'] = f"{precio_total_final_ars:.2f}"
        debug_info_response['etapas_calculo'].append(
            f"4. Redondeo Final (Unitario decena): {precio_venta_unitario_bruto:.4f} -> {precio_venta_unitario_redondeado}"
        )
        debug_info_response['etapas_calculo'].append(
            f"5. Total Final (unit*qty -> {tipo_redondeo_total}): {precio_venta_unitario_redondeado * cantidad_decimal:.2f} -> {precio_total_final_ars}"
        )
        return {
            "status": "success",
            "product_id_solicitado": product_id,
            "cantidad_solicitada": float(cantidad_decimal),
            "es_precio_especial": se_aplico_precio_especial,
            "precio_venta_unitario_ars": float(precio_venta_unitario_redondeado),
            "precio_unitario_ars": float(precio_venta_unitario_redondeado),  # Alias para compatibilidad
            "precio_total_calculado_ars": float(precio_total_final_ars),
            "tipo_redondeo_unitario": tipo_redondeo_unitario,
            "tipo_redondeo_total": tipo_redondeo_total,
            "tipo_redondeo_aplicado": tipo_redondeo_unitario,  # compat con productos (unitario)
            "costo_unitario_usd": float(costo_unitario_venta_usd),
            "costo_unitario_ars": float(costo_unitario_venta_ars),
            "tipo_cambio_usado": float(tc_obj.valor),
            "debug_info_completo": {
                "resumen_pasos": debug_info_response["etapas_calculo"],
                "desglose_variables": detalles_calculo_dinamico
            }
        }
    except (ValueError, InvalidOperation) as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        traceback.print_exc()
        return {"status": "error", "message": "Error interno del servidor."}
 
def aplicar_descuento(monto: Decimal, porcentaje: Decimal, redondeo: str = 'centena'):
    """
    Aplica un descuento global sobre el monto:
    1. Calcula el importe del descuento y lo redondea al siguiente múltiplo (decena o centena).
    2. Resta ese importe al monto original.
    3. Redondea el monto resultante al siguiente múltiplo.
    :param monto: Monto original (Decimal).
    :param porcentaje: Porcentaje de descuento (Decimal, 0-100).
    :param redondeo: Tipo de redondeo: 'centena' o 'decena'.
    :return: tupla (monto_sin_descuento_redondeado, monto_final_redondeado, tipo_redondeo_aplicado).
    """
    # 1. Cálculo y redondeo del importe del descuento
    descuento = monto * porcentaje / Decimal(100)
    if redondeo == 'decena':
        factor = 10
        tipo = 'decena'
    else:
        factor = 100
        tipo = 'centena'
    descuento_redondeado = Decimal(math.ceil(descuento / factor) * factor)
    # 2. Aplicar descuento redondeado
    monto_sin_descuento = monto - descuento_redondeado
    # 3. Redondeo final del monto resultante
    monto_final_redondeado = Decimal(math.ceil(monto_sin_descuento / factor) * factor)
    return monto_sin_descuento, monto_final_redondeado, tipo