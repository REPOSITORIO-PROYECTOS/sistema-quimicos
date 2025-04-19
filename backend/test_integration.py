# test_integration.py
import requests
import json
from pprint import pprint
from decimal import Decimal, ROUND_HALF_UP
import sys
import time # Para pequeñas pausas si es necesario

# --- Configuración ---
BASE_URL = "http://localhost:5000" # URL de tu API Flask
HEADERS = {'Content-Type': 'application/json'}

# --- IDs globales para entidades creadas ---
tc_oficial_valor = Decimal(1)
tc_empresa_valor = Decimal(1)
mp_solvente_id = None
mp_colorante_id = None
prod_limpiador_id = None
receta_limpiador_id = None
orden_compra_id = None
venta_id = None
proveedor_id = None # Asumiremos crear uno si no existe

# --- Funciones Auxiliares ---
def check_response(response, expected_status, test_name="Test"):
    """Verifica status, imprime y devuelve JSON, sale en error grave."""
    print(f"\n--- {test_name} ---")
    print(f"URL: {response.request.method} {response.url}")
    if response.request.body:
        try:
             # Evitar imprimir passwords si estuvieran en el body
             body_decoded = json.loads(response.request.body.decode())
             if isinstance(body_decoded, dict) and 'password' in body_decoded:
                 body_decoded['password'] = '***'
             print(f"Payload: {json.dumps(body_decoded, indent=2)}")
        except:
             print(f"Payload: (No JSON o error al decodificar)")

    print(f"--> Status Code: {response.status_code} (Esperado: {expected_status})")
    data = None
    try:
        data = response.json()
        print("Respuesta JSON:")
        pprint(data)
    except json.JSONDecodeError:
        print("Respuesta no es JSON:")
        print(response.text[:500] + ('...' if len(response.text) > 500 else '')) # Limitar salida larga
    print("-" * 40)

    if response.status_code != expected_status:
        print(f"¡¡¡ERROR FATAL!!! Status code inesperado en '{test_name}'.")
        sys.exit(1) # Detener el script en errores inesperados

    return data

def get_entity(url, expected_status=200, test_name="Get Entity"):
    """Hace un GET a una URL."""
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        return check_response(response, expected_status, test_name)
    except requests.exceptions.RequestException as e:
        print(f"¡¡¡ERROR FATAL!!! Error de conexión en '{test_name}': {e}")
        sys.exit(1)

def create_entity(url, payload, expected_status=201, test_name="Create Entity"):
    """Hace un POST a una URL."""
    try:
        response = requests.post(url, headers=HEADERS, json=payload, timeout=15)
        return check_response(response, expected_status, test_name)
    except requests.exceptions.RequestException as e:
        print(f"¡¡¡ERROR FATAL!!! Error de conexión en '{test_name}': {e}")
        sys.exit(1)

def update_entity(url, payload, expected_status=200, test_name="Update Entity"):
    """Hace un PUT a una URL."""
    try:
        response = requests.put(url, headers=HEADERS, json=payload, timeout=15)
        return check_response(response, expected_status, test_name)
    except requests.exceptions.RequestException as e:
        print(f"¡¡¡ERROR FATAL!!! Error de conexión en '{test_name}': {e}")
        sys.exit(1)

def delete_entity(url, expected_status=200, test_name="Delete Entity"):
    """Hace un DELETE a una URL."""
    try:
        response = requests.delete(url, headers=HEADERS, timeout=10)
        return check_response(response, expected_status, test_name)
    except requests.exceptions.RequestException as e:
        print(f"¡¡¡ERROR FATAL!!! Error de conexión en '{test_name}': {e}")
        sys.exit(1)

def setup_initial_data():
    """Obtiene TCs y crea un proveedor si no existe."""
    global tc_oficial_valor, tc_empresa_valor, proveedor_id
    print("\n===== SETUP INICIAL =====")

    # Obtener valores de TC
    tc_ofi_data = get_entity(f"{BASE_URL}/tipos_cambio/Oficial", 200, "Obtener TC Oficial")
    tc_ofi_valor_str = tc_ofi_data.get('valor') if tc_ofi_data else None
    if tc_ofi_valor_str is None:
        print("ERROR FATAL: No se pudo obtener el valor del TC Oficial.")
        sys.exit(1)
    tc_oficial_valor = Decimal(str(tc_ofi_valor_str))

    tc_emp_data = get_entity(f"{BASE_URL}/tipos_cambio/Empresa", 200, "Obtener TC Empresa")
    tc_emp_valor_str = tc_emp_data.get('valor') if tc_emp_data else None
    if tc_emp_valor_str is None:
        print("ERROR FATAL: No se pudo obtener el valor del TC Empresa.")
        sys.exit(1)
    tc_empresa_valor = Decimal(str(tc_emp_valor_str))

    print(f"TC Oficial: {tc_oficial_valor}, TC Empresa: {tc_empresa_valor}")

    # Crear proveedor (asumimos que no existe o lo creamos para la prueba)
    # En una suite real, buscarías uno existente o tendrías datos de prueba fijos
    proveedor_payload = {"nombre": "Proveedor de Prueba Integral", "cuit": "30-99999999-1"}
    # Intentamos crear, si falla con 409 (ya existe), está bien.
    try:
        resp_prov = requests.post(f"{BASE_URL}/proveedores", headers=HEADERS, json=proveedor_payload, timeout=10) # Asume endpoint /proveedores
        if resp_prov.status_code == 201:
             prov_data = resp_prov.json()
             proveedor_id = prov_data.get('id')
             print(f"Proveedor de prueba creado con ID: {proveedor_id}")
        elif resp_prov.status_code == 409:
             # Ya existe, necesitamos obtener su ID
             print("Proveedor de prueba ya existe, obteniendo ID...")
             # Asumiendo que puedes buscar proveedor por nombre o CUIT (necesitarías ese endpoint)
             # Por simplicidad, asignamos un ID fijo si falla la creación y existe (¡NO IDEAL!)
             print("WARN: No se implementó búsqueda de proveedor existente, usando ID 1 (¡puede fallar!)")
             proveedor_id = 1 # ¡¡AJUSTAR SI ES NECESARIO!! O implementar búsqueda
        else:
             check_response(resp_prov, 201, "Crear Proveedor de Prueba") # Forzará salida si hay otro error
    except requests.exceptions.RequestException as e:
         print(f"Error creando/verificando proveedor: {e}")
         sys.exit(1)
    except AttributeError: # Si el endpoint /proveedores no existe aún
         print("WARN: Endpoint /proveedores no encontrado, usando ID de proveedor 1 (¡puede fallar!)")
         proveedor_id = 1 # Asignación temporal

    if proveedor_id is None:
        print("ERROR FATAL: No se pudo obtener un ID de proveedor para las pruebas.")
        sys.exit(1)

# --- Flujo de Pruebas ---
def run_tests():
    global mp_solvente_id, mp_colorante_id, prod_limpiador_id, receta_limpiador_id, orden_compra_id, venta_id

    # 1. Crear Productos Base (Materias Primas)
    print("\n===== Test: Creando Materias Primas =====")
    payload_mp1 = {
        "codigo_interno": "MP-SOLV-INT", "nombre": "Solvente Integral", "unidad_venta": "L",
        "tipo_calculo": "PL", "ref_calculo": "10", "margen": "0.45",
        "costo_referencia_usd": "2.10", # Costo inicial
        "es_receta": False, "ajusta_por_tc": True # Oficial
    }
    mp1_data = create_entity(f"{BASE_URL}/productos", payload_mp1, 201, "Crear MP Solvente")
    mp_solvente_id = mp1_data.get('id')

    payload_mp2 = {
        "codigo_interno": "MP-COLOR-INT", "nombre": "Colorante Integral", "unidad_venta": "g",
        "tipo_calculo": "PD", "ref_calculo": "50", "margen": "0.65",
        "costo_referencia_usd": "0.12", # Costo inicial
        "es_receta": False, "ajusta_por_tc": False # Empresa
    }
    mp2_data = create_entity(f"{BASE_URL}/productos", payload_mp2, 201, "Crear MP Colorante")
    mp_colorante_id = mp2_data.get('id')

    # 2. Crear Producto que será Receta
    print("\n===== Test: Creando Producto para Receta =====")
    payload_rec = {
        "codigo_interno": "REC-LIMP-INT", "nombre": "Limpiador Integral", "unidad_venta": "Bidon",
        "tipo_calculo": "PL", "ref_calculo": "5", "margen": "0.50",
        "es_receta": False, "ajusta_por_tc": True # Oficial
    }
    rec_data = create_entity(f"{BASE_URL}/productos", payload_rec, 201, "Crear Producto Receta")
    prod_limpiador_id = rec_data.get('id')

    # 3. Simular Compra y Actualizar Costo MP1
    print("\n===== Test: Simular Compra y Actualizar Costo =====")
    costo_compra_ars = Decimal("2850.75")
    payload_upd_costo = {"costo_recepcion_ars": str(costo_compra_ars)}
    update_entity(f"{BASE_URL}/productos/{mp_solvente_id}/actualizar_costo_compra", payload_upd_costo, 200, "Actualizar Costo MP Solvente")

    # Verificar costo actualizado
    mp1_costos = get_entity(f"{BASE_URL}/productos/{mp_solvente_id}/costos", 200, "Verificar Costo MP Solvente Actualizado")
    costo_usd_nuevo = Decimal(str(mp1_costos.get("costo_referencia_usd")))
    costo_usd_esperado = (costo_compra_ars / tc_oficial_valor).quantize(Decimal("0.0001"))
    assert abs(costo_usd_nuevo - costo_usd_esperado) < Decimal("0.00001"), f"Costo USD actualizado no coincide ({costo_usd_nuevo} vs {costo_usd_esperado})"
    print(f"Verificación costo USD post-compra: OK ({costo_usd_nuevo})")

    # 4. Crear Receta
    print("\n===== Test: Crear Receta =====")
    payload_crear_receta = {
        "producto_final_id": prod_limpiador_id,
        "items": [
            {"ingrediente_id": mp_solvente_id, "porcentaje": "75.5"}, # 75.5%
            {"ingrediente_id": mp_colorante_id, "porcentaje": "24.5"}  # 24.5%
        ]
    }
    receta_data = create_entity(f"{BASE_URL}/recetas", payload_crear_receta, 201, "Crear Receta Limpiador")
    receta_limpiador_id = receta_data.get('id')

    # 5. Verificar Costo Calculado de Receta
    print("\n===== Test: Verificar Costo Receta =====")
    limpiador_costos = get_entity(f"{BASE_URL}/productos/{prod_limpiador_id}/costos", 200, "Obtener Costos Limpiador")
    costo_limpiador_usd = Decimal(str(limpiador_costos.get("costo_referencia_usd")))

    mp2_costos = get_entity(f"{BASE_URL}/productos/{mp_colorante_id}/costos", 200, "Obtener Costos MP Colorante") # Obtener costo actual MP2
    costo_mp2_usd = Decimal(str(mp2_costos.get("costo_referencia_usd")))

    costo_receta_esperado = ((costo_usd_nuevo * Decimal("0.755")) + (costo_mp2_usd * Decimal("0.245"))).quantize(Decimal("0.0001"))
    assert abs(costo_limpiador_usd - costo_receta_esperado) < Decimal("0.00001"), f"Costo receta no coincide ({costo_limpiador_usd} vs {costo_receta_esperado})"
    print(f"Verificación costo receta USD: OK ({costo_limpiador_usd})")

    # 6. Calcular Precio Venta Materia Prima
    print("\n===== Test: Calcular Precio Venta MP =====")
    payload_calc_mp2 = {"quantity": "250"} # Vender 250g de colorante
    calc_mp2_data = create_entity(f"{BASE_URL}/productos/{mp_colorante_id}/calculate_price", payload_calc_mp2, 200, "Calcular Precio Venta MP Colorante")
    # Verificar visualmente que usa TC Empresa, costo_final_venta_ars, coeficiente y precio final

    # 7. Calcular Precio Venta Producto Receta
    print("\n===== Test: Calcular Precio Venta Receta =====")
    payload_calc_rec = {"quantity": "2"} # Vender 2 bidones de limpiador
    calc_rec_data = create_entity(f"{BASE_URL}/productos/{prod_limpiador_id}/calculate_price", payload_calc_rec, 200, "Calcular Precio Venta Limpiador")
     # Verificar visualmente que usa TC Oficial, costo_final_venta_ars (basado en receta), coeficiente y precio final

    # 8. Simular una Venta completa
    print("\n===== Test: Registrar Venta =====")
    payload_venta = {
        "usuario_interno_id": 1, # Asume usuario ID 1 existe
        "cliente_id": 123, # ID de cliente ejemplo
        "items": [
            {"producto_id": mp_colorante_id, "cantidad": "150.75"},
            {"producto_id": prod_limpiador_id, "cantidad": "3"}
        ],
        "observaciones": "Venta de prueba integral"
    }
    venta_data = create_entity(f"{BASE_URL}/ventas", payload_venta, 201, "Registrar Venta")
    venta_id = venta_data.get('venta_id')
    # Verificar que el monto total calculado sea correcto (requiere recálculo manual o confiar en API)
    print(f"Venta registrada con ID: {venta_id}, Monto Total: {venta_data.get('monto_total_calculado')}")
    time.sleep(0.5) # Pequeña pausa

    # Obtener la venta creada para verificar detalles
    if venta_id:
        get_entity(f"{BASE_URL}/ventas/{venta_id}", 200, f"Obtener Venta Creada {venta_id}")


    # 9. Pruebas de Eliminación con Dependencias
    print("\n===== Test: Eliminación con Dependencias =====")
    # Intentar borrar MP Colorante (usado en Venta y era de Receta) - Debería fallar (RESTRICT en DetalleVenta)
    print(f"\nIntentando eliminar MP Colorante (ID: {mp_colorante_id}) usado en venta (espera 500 o error específico)")
    # Depende de cómo maneje SQLAlchemy/DB el RESTRICT. Puede ser 500 Internal Server Error o 409 Conflict si lo capturas.
    #delete_entity(f"{BASE_URL}/productos/{mp_colorante_id}", 500, "Eliminar MP Usado en Venta") # Espera 500
    try:
        resp_del_fail = requests.delete(f"{BASE_URL}/productos/{mp_colorante_id}", headers=HEADERS, timeout=10)
        if resp_del_fail.status_code >= 400:
             print(f"OK: Falló como esperado (Status: {resp_del_fail.status_code})")
             pprint(resp_del_fail.json() if resp_del_fail.content else resp_del_fail.text[:200])
        else:
             print(f"WARN: Se esperaba fallo al borrar producto vendido, pero se obtuvo {resp_del_fail.status_code}")
    except requests.exceptions.RequestException as e:
         print(f"Error de red eliminando producto: {e}")


    # Limpieza final (opcional, comentar si quieres revisar datos)
    print("\n===== Limpieza =====")
    if venta_id: delete_entity(f"{BASE_URL}/ventas/{venta_id}", 200, "Eliminar Venta")
    if receta_limpiador_id: delete_entity(f"{BASE_URL}/recetas/{receta_limpiador_id}", 200, "Eliminar Receta") # Ya no debería existir si se borró Producto
    if prod_limpiador_id: delete_entity(f"{BASE_URL}/productos/{prod_limpiador_id}", 200, "Eliminar Producto Receta")
    if mp_solvente_id: delete_entity(f"{BASE_URL}/productos/{mp_solvente_id}", 200, "Eliminar MP Solvente")
    if mp_colorante_id: delete_entity(f"{BASE_URL}/productos/{mp_colorante_id}", 200, "Eliminar MP Colorante") # Intentar de nuevo si la venta se borró


# --- Ejecución Principal ---
if __name__ == "__main__":
    print(">>> INICIANDO PRUEBAS DE INTEGRACIÓN API <<<")
    # 1. Verificar conexión básica
    try:
        response = requests.get(f"{BASE_URL}/hello", timeout=3) # Usa la ruta /hello que creamos
        response.raise_for_status()
        print(f"\nConexión OK con API en {BASE_URL}")
    except requests.exceptions.ConnectionError:
        print(f"\nERROR FATAL: No se pudo conectar al servidor API en {BASE_URL}")
        print("Asegúrate de que la aplicación Flask esté corriendo con 'python run.py'")
        sys.exit(1)
    except requests.exceptions.RequestException as e:
         print(f"\nERROR FATAL: Problema al conectar con API ({type(e).__name__}): {e}")
         sys.exit(1)

    # 2. Configurar datos iniciales (TCs, Proveedor)
    setup_initial_data()

    # 3. Ejecutar el flujo de pruebas
    run_tests()

    print("\n>>> PRUEBAS DE INTEGRACIÓN FINALIZADAS <<<")