#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Test para verificar que el dashboard funciona con rol VENTAS_PEDIDOS
"""
import requests
import json
from datetime import date

BASE_URL = "https://quimex.sistemataup.online"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwZWRpZG9zIiwicm9sIjoiVkVOVEFTX1BFRElET1MiLCJleHAiOjk5OTk5OTk5OTl9.test"

print("=" * 80)
print("TEST: Dashboard con rol VENTAS_PEDIDOS")
print("=" * 80)

fecha = date.today().isoformat()

# Test 1: Endpoint ligero para VENTAS_PEDIDOS
print(f"\n[TEST 1] GET /reportes/dashboard-kpis-lite?fecha={fecha}")
url = f"{BASE_URL}/reportes/dashboard-kpis-lite?fecha={fecha}"
headers = {"Authorization": f"Bearer {TOKEN}"}

try:
    response = requests.get(url, headers=headers)
    print(f"Status: {response.status_code}")
    
    if response.ok:
        data = response.json()
        print("✓ Response OK")
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(f"✗ Error: {response.status_code}")
        try:
            print(json.dumps(response.json(), indent=2, ensure_ascii=False))
        except:
            print(response.text)
except Exception as e:
    print(f"✗ Exception: {e}")

# Test 2: Endpoint completo para VENTAS_PEDIDOS (debería fallar con 403)
print(f"\n[TEST 2] GET /reportes/dashboard-kpis?fecha={fecha} (sin LITE)")
url = f"{BASE_URL}/reportes/dashboard-kpis?fecha={fecha}"

try:
    response = requests.get(url, headers=headers)
    print(f"Status: {response.status_code}")
    
    if response.ok:
        print("✓ Response OK (Tiene permiso)")
    else:
        print(f"✗ Error: {response.status_code} (Esperado si no tiene permiso)")
        try:
            print(json.dumps(response.json(), indent=2, ensure_ascii=False))
        except:
            print(response.text)
except Exception as e:
    print(f"✗ Exception: {e}")

print("\n" + "=" * 80)
print("Tests completados")
print("=" * 80)
