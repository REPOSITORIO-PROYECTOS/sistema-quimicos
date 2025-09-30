# app/utils/math_utils.py
from decimal import Decimal, ROUND_CEILING

def redondear_a_siguiente_decena_simplificado(valor_decimal: Decimal) -> tuple[Decimal, dict]:
    """
    Redondea un valor Decimal hacia arriba al siguiente múltiplo de 10.
    Devuelve el valor redondeado y un diccionario con pasos de depuración.
    """
    debug_pasos_redondeo = {}
    if not isinstance(valor_decimal, Decimal):
        original_valor_str = str(valor_decimal)
        valor_decimal = Decimal(original_valor_str)
        debug_pasos_redondeo['paso0_conversion_entrada'] = f"Entrada convertida de '{original_valor_str}' a Decimal '{valor_decimal}'"
    
    debug_pasos_redondeo['paso1_entrada_a_funcion'] = str(valor_decimal)
    valor_dividido = valor_decimal / Decimal('10')
    debug_pasos_redondeo['paso2_dividido_por_10'] = str(valor_dividido)
    valor_redondeado_arriba_entero = valor_dividido.to_integral_value(rounding=ROUND_CEILING)
    debug_pasos_redondeo['paso3_redondeado_arriba_entero'] = str(valor_redondeado_arriba_entero)
    resultado_final_decena = valor_redondeado_arriba_entero * Decimal('10')
    debug_pasos_redondeo['paso4_multiplicado_por_10'] = str(resultado_final_decena)
    resultado_formateado = resultado_final_decena.quantize(Decimal("0.01"))
    debug_pasos_redondeo['paso5_formateado_final'] = str(resultado_formateado)

    return resultado_formateado, debug_pasos_redondeo


def redondear_a_siguiente_decena(valor_decimal: Decimal) -> Decimal:
    """
    Redondea un valor Decimal hacia arriba al siguiente múltiplo de 10
    y devuelve un Decimal con 2 decimales (compatible con el resto del código).
    """
    if not isinstance(valor_decimal, Decimal):
        valor_decimal = Decimal(str(valor_decimal))
    valor_dividido = valor_decimal / Decimal('10')
    valor_entero_arriba = valor_dividido.to_integral_value(rounding=ROUND_CEILING)
    resultado = (valor_entero_arriba * Decimal('10')).quantize(Decimal('0.01'))
    return resultado


def redondear_a_siguiente_centena(valor_decimal: Decimal) -> Decimal:
    """
    Redondea un valor Decimal hacia arriba al siguiente múltiplo de 100.
    Devuelve un Decimal (sin formateo a 0.01 extra, la llamada puede decidirlo).
    """
    if not isinstance(valor_decimal, Decimal):
        valor_decimal = Decimal(str(valor_decimal))
    resultado = (valor_decimal / Decimal('100')).to_integral_value(rounding=ROUND_CEILING) * Decimal('100')
    return resultado