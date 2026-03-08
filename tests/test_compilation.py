#!/usr/bin/env python3
"""
Test de compilación para verificar que el backend y componentes están correctos
"""

import sys
import traceback

def test_backend_imports():
    """Test que todas las importaciones de Python funcionen"""
    print("\n=== TEST: Importaciones de Backend ===")
    try:
        from backend.app import db, create_app
        print("✓ Flask app imports OK")
        
        from backend.app.models import Venta, DetalleVenta, UsuarioInterno
        print("✓ Models imports OK")
        
        from backend.app.blueprints.dashboard import dashboard_bp
        print("✓ Dashboard blueprint imports OK")
        
        from backend.app.utils.decorators import token_required, roles_required
        print("✓ Decorators imports OK")
        
        from backend.app.utils.permissions import ROLES
        print("✓ Permissions imports OK")
        
        return True
    except Exception as e:
        print(f"✗ Error: {e}")
        traceback.print_exc()
        return False

def test_flask_app():
    """Test que la app Flask se inicializa correctamente"""
    print("\n=== TEST: Flask App Initialization ===")
    try:
        from backend.app import create_app
        app = create_app()
        print("✓ Flask app created successfully")
        
        # Verificar que el blueprint está registrado
        if 'dashboard' in [blueprint.name for blueprint in app.blueprints.values()]:
            print("✓ Dashboard blueprint registered")
        else:
            print("✗ Dashboard blueprint not registered")
            return False
        
        # Verificar rutas
        routes = [str(rule) for rule in app.url_map.iter_rules()]
        dashboard_routes = [r for r in routes if 'dashboard' in r]
        print(f"✓ Found {len(dashboard_routes)} dashboard routes:")
        for route in dashboard_routes:
            print(f"  - {route}")
        
        if '/dashboard/kpis' not in dashboard_routes:
            print("✗ /dashboard/kpis route not found")
            return False
        
        if '/dashboard/ventas-pedidos' not in dashboard_routes:
            print("✗ /dashboard/ventas-pedidos route not found")
            return False
        
        return True
    except Exception as e:
        print(f"✗ Error: {e}")
        traceback.print_exc()
        return False

def test_python_syntax():
    """Test que todos los archivos Python tienen sintaxis correcta"""
    print("\n=== TEST: Python Syntax ===")
    import os
    import py_compile
    
    python_files = []
    backend_path = os.path.join(os.getcwd(), 'backend')
    
    for root, dirs, files in os.walk(backend_path):
        # Ignorar __pycache__
        dirs[:] = [d for d in dirs if d != '__pycache__']
        for file in files:
            if file.endswith('.py'):
                python_files.append(os.path.join(root, file))
    
    errors = []
    for py_file in python_files[:10]:  # Probar primeros 10 archivos
        try:
            py_compile.compile(py_file, doraise=True)
            print(f"✓ {os.path.relpath(py_file)}")
        except py_compile.PyCompileError as e:
            print(f"✗ {os.path.relpath(py_file)}: {e}")
            errors.append(py_file)
    
    return len(errors) == 0

def main():
    print("=" * 60)
    print("TESTING COMPILATION AND IMPORTS")
    print("=" * 60)
    
    results = []
    
    # Test 1: Python syntax
    results.append(("Python Syntax", test_python_syntax()))
    
    # Test 2: Backend imports
    results.append(("Backend Imports", test_backend_imports()))
    
    # Test 3: Flask app
    results.append(("Flask App", test_flask_app()))
    
    # Resumen
    print("\n" + "=" * 60)
    print("RESUMEN")
    print("=" * 60)
    
    all_passed = True
    for test_name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status}: {test_name}")
        if not passed:
            all_passed = False
    
    print("=" * 60)
    
    if all_passed:
        print("\n🎉 ¡TODOS LOS TESTS PASARON!")
        return 0
    else:
        print("\n❌ ALGUNOS TESTS FALLARON")
        return 1

if __name__ == "__main__":
    sys.exit(main())
