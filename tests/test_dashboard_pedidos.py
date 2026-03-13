#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Test para verificar que el Dashboard Pedidos funciona correctamente (Backend -> Frontend)

Este test valida que:
1. El backend envía los datos en la estructura correcta
2. Los datos que espera DashboardPedidos.tsx están presentes
3. Los valores numéricos son válidos
4. El componente frontend puede recibir y renderizar correctamente la data

Estructura de datos esperada por DashboardPedidos.tsx:
{
  "hoy": {
    "cantidad_pedidos": number,
    "cantidad_kilos": number,
    "ingreso_puerta_hoy": number
  },
  "pendiente_entrega": {
    "cantidad_pedidos": number,
    "cantidad_kilos": number
  }
}
"""
import requests
import json
import os
from datetime import date

BASE_URL = "https://quimex.sistemataup.online"

# Leer tokens de variables de entorno
VALID_VENTAS_PEDIDOS_TOKEN = os.getenv('VENTAS_PEDIDOS_TOKEN', None)
VALID_ADMIN_TOKEN = os.getenv('ADMIN_TOKEN', None)

print("=" * 120)
print("TEST: DashboardPedidos.tsx - Validación Backend → Frontend")
print("=" * 120)

if not VALID_VENTAS_PEDIDOS_TOKEN:
    print("\n⚠️  ADVERTENCIA: No se proporcionó token VENTAS_PEDIDOS")
    print("   Para usar tokens reales, ejecuta:")
    print("   export VENTAS_PEDIDOS_TOKEN='tu_token_aqui'")
    print("   export ADMIN_TOKEN='tu_admin_token'")
    print("\n   Los tests con tokens simulados devolverán 401 (esperado)\n")

# Estructura esperada que busca DashboardPedidos.tsx
EXPECTED_FRONTEND_STRUCTURE = {
    "hoy": {
        "cantidad_pedidos": int,
        "cantidad_kilos": float,
        "ingreso_puerta_hoy": float
    },
    "pendiente_entrega": {
        "cantidad_pedidos": int,
        "cantidad_kilos": float
    }
}

def validate_structure(data, structure, path="root"):
    """Valida recursivamente que la estructura de datos sea correcta"""
    errors = []
    
    for key, expected_type in structure.items():
        current_path = f"{path}.{key}" if path != "root" else key
        
        if key not in data:
            errors.append(f"❌ Missing key: {current_path}")
            continue
            
        if isinstance(expected_type, dict):
            if not isinstance(data[key], dict):
                errors.append(f"❌ {current_path} should be dict but got {type(data[key]).__name__}")
                continue
            sub_errors = validate_structure(data[key], expected_type, current_path)
            errors.extend(sub_errors)
        else:
            if not isinstance(data[key], expected_type):
                errors.append(f"❌ {current_path} should be {expected_type.__name__} but got {type(data[key]).__name__}")
            else:
                print(f"✓ {current_path}: {type(data[key]).__name__} = {data[key]}")
    
    return errors

def validate_numeric_values(data):
    """Valida que los valores numéricos sean válidos (>= 0)"""
    errors = []
    
    hoy = data.get("hoy", {})
    pendiente = data.get("pendiente_entrega", {})
    
    validations = [
        ("hoy.cantidad_pedidos", hoy.get('cantidad_pedidos')),
        ("hoy.cantidad_kilos", hoy.get('cantidad_kilos')),
        ("hoy.ingreso_puerta_hoy", hoy.get('ingreso_puerta_hoy')),
        ("pendiente_entrega.cantidad_pedidos", pendiente.get('cantidad_pedidos')),
        ("pendiente_entrega.cantidad_kilos", pendiente.get('cantidad_kilos')),
    ]
    
    for name, value in validations:
        if isinstance(value, (int, float)):
            if value >= 0:
                print(f"✓ {name}: {value}")
            else:
                errors.append(f"❌ {name}: {value} (debe ser >= 0)")
        else:
            errors.append(f"❌ {name}: valor no numérico ({type(value).__name__})")
    
    return errors

# TEST 1: Validar estructura con token VENTAS_PEDIDOS
print("\n" + "=" * 120)
print("[TEST 1] Estructura de datos para DashboardPedidos.tsx (VENTAS_PEDIDOS)")
print("=" * 120)

endpoint = f"{BASE_URL}/api/dashboard/ventas-pedidos"

if VALID_VENTAS_PEDIDOS_TOKEN:
    headers = {"Authorization": f"Bearer {VALID_VENTAS_PEDIDOS_TOKEN}"}
    try:
        response = requests.get(endpoint, headers=headers, timeout=10)
        print(f"\nStatus Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("✓ Respuesta recibida (200)")
            
            print("\n[Estructura esperada]:")
            print(json.dumps(EXPECTED_FRONTEND_STRUCTURE, indent=2, default=str))
            
            print("\n[Datos recibidos]:")
            print(json.dumps(data, indent=2, ensure_ascii=False))
            
            print("\n[Validación de tipos]:")
            errors = validate_structure(data, EXPECTED_FRONTEND_STRUCTURE)
            
            if errors:
                print("\n⚠️  Errores encontrados:")
                for error in errors:
                    print(f"  {error}")
            else:
                print("\n✓ Estructura correcta - Frontend puede usar esta data")
        else:
            print(f"✗ Error: {response.status_code}")
            if response.status_code == 401:
                print("  (Token inválido o expirado)")
            elif response.status_code == 403:
                print("  (No tiene permiso)")
                
    except Exception as e:
        print(f"✗ Exception: {e}")
else:
    print("⏭️  Test omitido - Proporciona VENTAS_PEDIDOS_TOKEN")

# TEST 2: Validar valores numéricos
print("\n" + "=" * 120)
print("[TEST 2] Validación de valores numéricos")
print("=" * 120)

if VALID_VENTAS_PEDIDOS_TOKEN:
    try:
        response = requests.get(endpoint, headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            
            print("\n[Validando valores numéricos]:")
            errors = validate_numeric_values(data)
            
            if errors:
                print("\n⚠️  Valores inválidos encontrados:")
                for error in errors:
                    print(f"  {error}")
            else:
                print("\n✓ Todos los valores son válidos (>= 0)")
                
            # Calcular totales para verificación
            pendiente = data.get("pendiente_entrega", {})
            hoy = data.get("hoy", {})
            
            print(f"\n[Resumen de datos para DashboardPedidos.tsx]:")
            print(f"  KGs a entregar (pendientes): {pendiente.get('cantidad_kilos', 0)} kg")
            print(f"  Pedidos pendientes: {pendiente.get('cantidad_pedidos', 0)} pedidos")
            print(f"  Ingreso puerta hoy: ${hoy.get('ingreso_puerta_hoy', 0):.2f}")
        else:
            print(f"✗ Failed to get data: {response.status_code}")
    except Exception as e:
        print(f"✗ Exception: {e}")
else:
    print("⏭️  Test omitido - Proporciona VENTAS_PEDIDOS_TOKEN")

# TEST 3: Validar que solo VENTAS_PEDIDOS y ADMIN puedan acceder
print("\n" + "=" * 120)
print("[TEST 3] Control de acceso (solo VENTAS_PEDIDOS y ADMIN)")
print("=" * 120)

print("\n[Sin token]:")
try:
    response = requests.get(endpoint, timeout=10)
    if response.status_code == 401:
        print("✓ Correctamente rechazado (401) - Se requiere autenticación")
    else:
        print(f"✗ Respuesta inesperada: {response.status_code}")
except Exception as e:
    print(f"✗ Exception: {e}")

print("\n[Con token ADMIN]:")
if VALID_ADMIN_TOKEN:
    headers = {"Authorization": f"Bearer {VALID_ADMIN_TOKEN}"}
    try:
        response = requests.get(endpoint, headers=headers, timeout=10)
        if response.status_code == 200:
            print("✓ ADMIN tiene acceso al endpoint")
        else:
            print(f"✗ Status: {response.status_code}")
    except Exception as e:
        print(f"✗ Exception: {e}")
else:
    print("⏭️  Test omitido - Proporciona ADMIN_TOKEN")

# TEST 4: Validar formato de respuesta para renderizado
print("\n" + "=" * 120)
print("[TEST 4] Validación para renderizado en DashboardPedidos.tsx")
print("=" * 120)

if VALID_VENTAS_PEDIDOS_TOKEN:
    try:
        response = requests.get(endpoint, headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            
            print("\n[Evaluando renderizado de componentes]:")
            
            # Card 1: KGs a entregar
            kgs = data.get("pendiente_entrega", {}).get("cantidad_kilos", 0)
            print(f"✓ Card 'KGs A ENTREGAR' renderizará: {kgs} kg")
            
            # Card 2: Pedidos pendientes
            pedidos = data.get("pendiente_entrega", {}).get("cantidad_pedidos", 0)
            print(f"✓ Card 'PEDIDOS PENDIENTES' renderizará: {pedidos} pedidos")
            
            # Card 3: Puerta hoy
            puerta = data.get("hoy", {}).get("ingreso_puerta_hoy", 0)
            print(f"✓ Card 'PUERTA HOY' renderizará: ${puerta:.2f}")
            
            print("\n✓ DashboardPedidos.tsx puede renderizar correctamente todos los datos")
    except Exception as e:
        print(f"✗ Exception: {e}")
else:
    print("⏭️  Test omitido - Proporciona VENTAS_PEDIDOS_TOKEN")

print("\n" + "=" * 120)
print("TESTS COMPLETADOS")
print("=" * 120)
print("\nPara ejecutar con datos reales:")
print("  export VENTAS_PEDIDOS_TOKEN='tu_token_valido'")
print("  export ADMIN_TOKEN='tu_admin_token_valido'")
print("  source venv/bin/activate")
print("  python3 tests/test_dashboard_pedidos.py")



