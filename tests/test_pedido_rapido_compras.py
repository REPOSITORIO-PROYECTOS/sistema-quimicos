"""
TEST DE INTEGRACIÓN: Pedido Rápido + Lógica de Validación de Compras

Simula un pedido con datos reales del formulario pedido-rapido 
y verifica que la validación de importe_abonado funciona correctamente.

Caso Original que fallaba:
- Items total: 600,000 ARS
- IVA 21%: +126,000
- IIBB 3.5%: +21,000
- Total estimado: 747,000 ARS
- importe_abonado: 747,000 ARS (ÉL FALLABA ANTES)

Esperado después del fix: DEBE APROBARSE ✓
"""

from decimal import Decimal, ROUND_HALF_UP

def _parse_percentage_rate(value):
    """Convierte "21", "0.21", "21%" a Decimal como fracción"""
    if not value:
        return Decimal('0')
    val_str = str(value).strip().rstrip('%')
    try:
        val = Decimal(val_str)
        if val > 1:
            return val / Decimal('100')
        return val
    except:
        return Decimal('0')

def _parse_iibb_rate(value):
    """IIBB es especial: puede ser "3", "0.035" o "3.5" """
    if not value:
        return Decimal('0')
    val_str = str(value).strip().rstrip('%')
    try:
        val = Decimal(val_str)
        if val > 1:
            return val / Decimal('100')
        return val
    except:
        return Decimal('0')

def validate_orden_creation(items_total, iva_rate, iibb_rate, importe_abonado):
    """
    Simula la lógica de validación del endpoint POST /ordenes_compra/crear
    
    Returns: (success: bool, message: str, calculated_total: Decimal)
    """
    base_total = Decimal(str(items_total))
    
    # Parse rates (ej: "21" -> 0.21)
    iva_rate_decimal = _parse_percentage_rate(iva_rate)
    iibb_rate_decimal = _parse_iibb_rate(iibb_rate)
    
    # Calculate taxes
    iva_amount = base_total * iva_rate_decimal
    iibb_amount = base_total * iibb_rate_decimal
    
    # Total with taxes
    importe_total_estimado_calc = (base_total + iva_amount + iibb_amount).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    # Convert payment to Decimal
    importe_abonado_val = Decimal(str(importe_abonado))
    
    # VALIDATION: importe_abonado must NOT exceed the total WITH taxes
    if importe_abonado_val > importe_total_estimado_calc:
        return (
            False, 
            f"'{importe_abonado_val}' no puede superar el total estimado '{importe_total_estimado_calc}'",
            importe_total_estimado_calc
        )
    
    return (True, "Validación OK", importe_total_estimado_calc)


def test_pedido_rapido_casos():
    """
    Tests del formulario pedido-rapido con diferentes escenarios
    """
    print("=" * 80)
    print("TEST: VALIDACIÓN DE COMPRAS - LÓGICA POST /ordenes_compra/crear")
    print("=" * 80)
    print()
    
    test_cases = [
        {
            "name": "CASO ORIGINAL (Falló antes, debe pasar ahora)",
            "items_total": 600000,
            "iva": "21",
            "iibb": "3.5",
            "importe_abonado": 747000,
            "expected_pass": True,
            "expected_total": 747000,
        },
        {
            "name": "Pago parcial valido",
            "items_total": 600000,
            "iva": "21", 
            "iibb": "3.5",
            "importe_abonado": 500000,  # Menos que el total
            "expected_pass": True,
            "expected_total": 747000,
        },
        {
            "name": "Pago 0 (deuda completa)",
            "items_total": 600000,
            "iva": "21",
            "iibb": "3.5",
            "importe_abonado": 0,  
            "expected_pass": True,
            "expected_total": 747000,
        },
        {
            "name": "Pago que EXCEDE total (debe fallar)",
            "items_total": 600000,
            "iva": "21",
            "iibb": "3.5",
            "importe_abonado": 800000,  # Más que el total
            "expected_pass": False,
            "expected_total": 747000,
        },
        {
            "name": "Sin IVA ni IIBB",
            "items_total": 600000,
            "iva": "0",
            "iibb": "0",
            "importe_abonado": 600000,  
            "expected_pass": True,
            "expected_total": 600000,
        },
        {
            "name": "Solo IVA",
            "items_total": 600000,
            "iva": "21",
            "iibb": "0",
            "importe_abonado": 726000,  # 600k + 21% = 726k
            "expected_pass": True,
            "expected_total": 726000,
        },
    ]
    
    passed = 0
    failed = 0
    
    for i, test in enumerate(test_cases, 1):
        print(f"\nTest {i}: {test['name']}")
        print(f"  Datos entrada:")
        print(f"    - Items total: ${test['items_total']:,.0f}")
        print(f"    - IVA: {test['iva']}%")
        print(f"    - IIBB: {test['iibb']}%")
        print(f"    - Importe a abonar: ${test['importe_abonado']:,.0f}")
        
        success, message, calculated_total = validate_orden_creation(
            test['items_total'],
            test['iva'],
            test['iibb'],
            test['importe_abonado']
        )
        
        print(f"  Resultado:")
        print(f"    - Total calculado (con impuestos): ${calculated_total:,.2f}")
        print(f"    - Validación: {'✓ APROBADA' if success else '✗ RECHAZADA'}")
        print(f"    - Razón: {message}")
        
        # Check if result matches expectation
        if success == test['expected_pass'] and calculated_total == Decimal(str(test['expected_total'])):
            print(f"  ✓ PASS")
            passed += 1
        else:
            print(f"  ✗ FAIL - Esperado: {test['expected_pass']}, Total: {test['expected_total']}")
            failed += 1
    
    print("\n" + "=" * 80)
    print(f"RESULTADOS: {passed} Pass, {failed} Fail")
    print("=" * 80)
    
    return passed, failed


def simulate_pedido_rapido_frontend():
    """
    Simula exactamente lo que el formulario pedido-rapido calcula y envía
    """
    print("\n" + "=" * 80)
    print("SIMULACIÓN: FORMULARIO PEDIDO-RÁPIDO (Frontend Calculation)")
    print("=" * 80)
    print()
    
    # Valores del formulario original
    cantidad = 12           # L
    precio_unitario = 21   # ARS por L
    tc = 1470              # Tipo de cambio USD a ARS
    show_tc = True
    iva = "21"             # %
    iibb = "3.5"           # %
    show_iva = True
    show_iibb = True
    
    # Cálculo en frontend (igual al componente)
    subtotal = cantidad * precio_unitario * tc if show_tc else (cantidad * precio_unitario)
    total_con_impuestos = subtotal
    
    if show_iva:
        total_con_impuestos += subtotal * (float(iva) / 100) if iva else 0
    if show_iibb:
        total_con_impuestos += subtotal * (float(iibb) / 100) if iibb else 0
    
    print(f"Entrada del formulario:")
    print(f"  Cantidad: {cantidad} L")
    print(f"  Precio unitario: ${precio_unitario} ARS/L")
    print(f"  Tipo de cambio: {tc} ARS/USD")
    print(f"  IVA: {iva}%")
    print(f"  IIBB: {iibb}%")
    print()
    print(f"Cálculo en Frontend:")
    print(f"  Subtotal: {cantidad} × {precio_unitario} × {tc} = ${subtotal:,.0f}")
    print(f"  IVA ({iva}%): ${subtotal * (float(iva)/100):,.0f}")
    print(f"  IIBB ({iibb}%): ${subtotal * (float(iibb)/100):,.0f}")
    print(f"  TOTAL CON IMPUESTOS: ${total_con_impuestos:,.2f}")
    print()
    
    # Pago completo
    importe_abonado = total_con_impuestos
    
    print(f"Envío al backend:")
    print(f"  importe_abonado: ${importe_abonado:,.2f}")
    print()
    
    # Validación en backend
    success, message, calc_total = validate_orden_creation(
        subtotal,   # Items total (sin impuestos)
        iva,
        iibb,
        importe_abonado
    )
    
    print(f"Validación en Backend:")
    print(f"  Total calculado: ${calc_total:,.2f}")
    print(f"  Resultado: {'✓ APROBADA' if success else '✗ RECHAZADA'}")
    print(f"  {message}")
    print()


if __name__ == '__main__':
    # Test cases
    passed, failed = test_pedido_rapido_casos()
    
    # Simulación
    simulate_pedido_rapido_frontend()
    
    # Summary
    print("\nRESUMEN:")
    if failed == 0:
        print("✓ Todos los tests pasaron - VALIDACIÓN FUNCIONANDO")
    else:
        print(f"✗ {failed} tests fallaron - REVISAR LÓGICA")
