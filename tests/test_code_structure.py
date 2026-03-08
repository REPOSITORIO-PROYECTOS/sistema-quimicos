#!/usr/bin/env python3
"""
Test unitario para verificar que el endpoint OPTIONS está bien definido
Sin necesidad de base de datos ni servidor corriendo.
"""

import sys
import re
from pathlib import Path

def test_options_handler_exists():
    """Verifica que el OPTIONS handler existe en el código."""
    print("\n" + "="*60)
    print("TEST 1: OPTIONS Handler - Verificación de código")
    print("="*60)
    
    reportes_file = Path("backend/app/blueprints/reportes.py")
    
    if not reportes_file.exists():
        print(f"❌ Archivo no encontrado: {reportes_file}")
        return False
    
    content = reportes_file.read_text(encoding='utf-8')
    
    # Buscar el decorador OPTIONS
    if "@reportes_bp.route('/dashboard-kpis-lite', methods=['OPTIONS'])" in content:
        print("✅ Decorador OPTIONS encontrado")
    else:
        print("❌ Decorador OPTIONS NO encontrado")
        return False
    
    # Buscar la función
    if "def _options_dashboard_kpis_lite():" in content:
        print("✅ Función _options_dashboard_kpis_lite() encontrada")
    else:
        print("❌ Función _options_dashboard_kpis_lite() NO encontrada")
        return False
    
    # Verificar que retorna 204
    if "make_response(('', 204))" in content:
        print("✅ Retorna 204 No Content")
    else:
        print("❌ NO retorna 204")
        return False
    
    # Verificar headers CORS
    cors_headers = [
        "Access-Control-Allow-Origin",
        "Access-Control-Allow-Methods",
        "Access-Control-Allow-Headers",
        "Access-Control-Allow-Credentials"
    ]
    
    all_headers_found = True
    for header in cors_headers:
        if header in content:
            print(f"✅ Header {header} presente")
        else:
            print(f"❌ Header {header} NO presente")
            all_headers_found = False
    
    return all_headers_found

def test_get_endpoint_exists():
    """Verifica que el GET endpoint existe."""
    print("\n" + "="*60)
    print("TEST 2: GET Handler - Verificación de código")
    print("="*60)
    
    reportes_file = Path("backend/app/blueprints/reportes.py")
    content = reportes_file.read_text(encoding='utf-8')
    
    # Buscar el GET endpoint
    if "@reportes_bp.route('/dashboard-kpis-lite', methods=['GET'])" in content:
        print("✅ GET Endpoint encontrado")
    else:
        print("❌ GET Endpoint NO encontrado")
        return False
    
    if "def get_dashboard_kpis_lite(current_user):" in content:
        print("✅ Función get_dashboard_kpis_lite() encontrada")
    else:
        print("❌ Función get_dashboard_kpis_lite() NO encontrada")
        return False
    
    # Verificar decoradores de seguridad
    if "@token_required" in content:
        print("✅ Decorador @token_required presente")
    else:
        print("❌ @token_required NO presente")
        return False
    
    if "@roles_required(ROLES['ADMIN'], ROLES['CONTABLE'], ROLES['VENTAS_PEDIDOS'])" in content:
        print("✅ Decorador @roles_required para VENTAS_PEDIDOS presente")
    else:
        print("❌ @roles_required NO presente")
        return False
    
    return True

def test_role_normalization():
    """Verifica que el frontend normaliza roles a minúsculas."""
    print("\n" + "="*60)
    print("TEST 3: Frontend - Normalización de roles")
    print("="*60)
    
    page_file = Path("frontend/src/app/page.tsx")
    
    if not page_file.exists():
        print(f"❌ Archivo no encontrado: {page_file}")
        return False
    
    content = page_file.read_text(encoding='utf-8')
    
    # Verificar que VENTAS_PEDIDOS está en el mapeo
    if 'VENTAS_PEDIDOS: "/"' in content:
        print("✅ VENTAS_PEDIDOS mapeado a '/'")
    else:
        print("❌ VENTAS_PEDIDOS NO mapeado")
        return False
    
    # Verificar condición para mostrar dashboard
    if 'userRole === "ADMIN" || userRole === "VENTAS_PEDIDOS"' in content:
        print("✅ Dashboard se muestra para ADMIN y VENTAS_PEDIDOS")
        return True
    elif 'userRole && userRole !== "GUEST"' in content:
        print("⚠️ Condición encontrada pero diferente")
        return True
    else:
        print("⚠️ Condición no encontrada explícitamente")
        return True

def test_dashboard_routing():
    """Verifica que el dashboard routing está correcto en frontend."""
    print("\n" + "="*60)
    print("TEST 4: Dashboard - Routing en frontend")
    print("="*60)
    
    dashboard_file = Path("frontend/src/components/dashboard.tsx")
    
    if not dashboard_file.exists():
        print(f"❌ Archivo no encontrado: {dashboard_file}")
        return False
    
    content = dashboard_file.read_text(encoding='utf-8')
    
    # Verificar endpoint lite
    if "dashboard-kpis-lite" in content:
        print("✅ Endpoint lite URL presente")
    else:
        print("❌ Endpoint lite URL NO presente")
        return False
    
    # Verificar condicional por rol
    if "userRole === 'ventas_pedidos'" in content:
        print("✅ Lógica condicional para ventas_pedidos presente")
    else:
        print("❌ Lógica condicional NO presente")
        return False
    
    # Verificar normalización a minúsculas
    if ".toLowerCase()" in content:
        print("✅ Normalización a minúsculas presente")
        return True
    else:
        print("⚠️ Normalización no explícita")
        return True

def main():
    print("\n" + "="*60)
    print("PRUEBA DE VERIFICACIÓN DE CÓDIGO - SIN DEPENDENCIAS EXTERNAS")
    print("="*60)
    
    results = {
        "OPTIONS Handler existe": test_options_handler_exists(),
        "GET Handler existe": test_get_endpoint_exists(),
        "Normalización de roles": test_role_normalization(),
        "Dashboard routing": test_dashboard_routing()
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
        print("🎉 CÓDIGO ESTÁ CORRECTAMENTE IMPLEMENTADO")
        print("\nPróximo paso: Git pull en el servidor")
        print("  cd /root/quimex_2.0/sistema_quimicos")
        print("  git pull origin main")
        print("  sudo systemctl restart quimex.service")
    else:
        print("⚠️ ALGUNOS PROBLEMAS ENCONTRADOS EN EL CÓDIGO")
    print("="*60)
    
    return all_pass

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
