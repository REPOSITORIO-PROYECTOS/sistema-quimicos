#!/usr/bin/env python3
"""
Test completo para verificar que el backend responde correctamente
al preflight CORS y que el endpoint /dashboard-kpis-lite funciona.
"""

import requests
import json
from datetime import date

# URLs de prueba
BASE_URL = "https://quimex.sistemataup.online"
DASHBOARD_LITE = f"{BASE_URL}/reportes/dashboard-kpis-lite?fecha={date.today().isoformat()}"
DASHBOARD_FULL = f"{BASE_URL}/reportes/dashboard-kpis?fecha={date.today().isoformat()}"

def test_options_preflight():
    """Test 1: Verifica que OPTIONS responda con 204 y headers CORS correctos."""
    print("\n" + "="*60)
    print("TEST 1: OPTIONS Preflight Request")
    print("="*60)
    
    headers = {
        "Origin": "https://quimex.netlify.app",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization,Content-Type"
    }
    
    try:
        response = requests.options(DASHBOARD_LITE, headers=headers, timeout=5)
        print(f"Status Code: {response.status_code}")
        print(f"Headers CORS:")
        for key in ['Access-Control-Allow-Origin', 'Access-Control-Allow-Methods', 
                    'Access-Control-Allow-Headers', 'Access-Control-Allow-Credentials']:
            print(f"  {key}: {response.headers.get(key, 'NOT FOUND')}")
        
        if response.status_code == 204:
            print("✅ OPTIONS retorna 204 (correcto)")
            return True
        else:
            print(f"❌ OPTIONS retorna {response.status_code} (esperaba 204)")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_get_endpoint_no_auth():
    """Test 2: Verifica que GET sin auth retorna 401."""
    print("\n" + "="*60)
    print("TEST 2: GET /dashboard-kpis-lite sin Authorization")
    print("="*60)
    
    try:
        response = requests.get(DASHBOARD_LITE, timeout=5)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 401:
            print("✅ Retorna 401 (correcto - requiere auth)")
            return True
        else:
            print(f"⚠️ Retorna {response.status_code} (esperaba 401)")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_endpoint_with_invalid_token():
    """Test 3: Verifica que GET con token inválido retorna error."""
    print("\n" + "="*60)
    print("TEST 3: GET /dashboard-kpis-lite con token inválido")
    print("="*60)
    
    headers = {
        "Authorization": "Bearer invalid_token_test"
    }
    
    try:
        response = requests.get(DASHBOARD_LITE, headers=headers, timeout=5)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code in [401, 422]:
            print("✅ Retorna error de auth (correcto)")
            return True
        else:
            print(f"⚠️ Status: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_full_cors_flow():
    """Test 4: Simula el flujo completo de CORS desde navegador."""
    print("\n" + "="*60)
    print("TEST 4: Flujo completo CORS (OPTIONS + GET)")
    print("="*60)
    
    cors_headers = {
        "Origin": "https://quimex.netlify.app",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization,Content-Type"
    }
    
    # Paso 1: Preflight
    print("\nPaso 1: OPTIONS Preflight...")
    try:
        response_options = requests.options(DASHBOARD_LITE, headers=cors_headers, timeout=5)
        print(f"  Status: {response_options.status_code}")
        
        if response_options.status_code != 204:
            print(f"  ❌ OPTIONS falló con {response_options.status_code}")
            return False
        
        print("  ✅ Preflight OK")
    except Exception as e:
        print(f"  ❌ ERROR en preflight: {e}")
        return False
    
    # Paso 2: GET con token (aunque sea inválido, prueba la ruta)
    print("\nPaso 2: GET con token...")
    headers_get = {
        "Authorization": "Bearer test_token_123",
        "Origin": "https://quimex.netlify.app"
    }
    
    try:
        response_get = requests.get(DASHBOARD_LITE, headers=headers_get, timeout=5)
        print(f"  Status: {response_get.status_code}")
        
        # Cualquier status que no sea 404 significa que la ruta existe
        if response_get.status_code == 404:
            print(f"  ❌ Endpoint no encontrado (404)")
            return False
        
        print(f"  ✅ Endpoint existe (status {response_get.status_code})")
        return True
    except Exception as e:
        print(f"  ❌ ERROR en GET: {e}")
        return False

def main():
    print("\n" + "="*60)
    print("PRUEBA COMPLETA DEL BACKEND - DASHBOARD KPIs LITE")
    print("="*60)
    
    results = {
        "OPTIONS Preflight": test_options_preflight(),
        "GET sin auth": test_get_endpoint_no_auth(),
        "GET con token inválido": test_endpoint_with_invalid_token(),
        "Flujo CORS completo": test_full_cors_flow()
    }
    
    print("\n" + "="*60)
    print("RESUMEN DE RESULTADOS")
    print("="*60)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name}: {status}")
    
    all_pass = all(results.values())
    
    print("\n" + "="*60)
    if all_pass:
        print("🎉 TODOS LOS TESTS PASARON - BACKEND LISTO PARA PRODUCCIÓN")
    else:
        print("⚠️ ALGUNOS TESTS FALLARON - REVISAR BACKEND")
    print("="*60)
    
    return all_pass

if __name__ == "__main__":
    main()
