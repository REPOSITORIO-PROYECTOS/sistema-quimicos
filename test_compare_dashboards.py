#!/usr/bin/env python3
"""
Test para comparar valores entre Dashboard Admin y Dashboard Pedidos
Identifica inconsistencias en montos e ingresos
"""
import requests
import json
from datetime import date, datetime
from decimal import Decimal

BASE_URL = "https://quimex.sistemataup.online"

# Token de ejemplo - reemplazar con un token válido
TOKEN = "tu_token_aqui"

def obtener_token():
    """Si necesitas obtener un token, puedes hacerlo aquí"""
    # Por ahora, el token se pasa como parámetro
    return TOKEN

def test_dashboards():
    """Compara los valores de ambos dashboards"""
    
    hoy = date.today().isoformat()
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    
    print("=" * 80)
    print(f"COMPARACIÓN DE DASHBOARDS - {hoy}")
    print("=" * 80)
    
    # 1. Obtener datos del Dashboard Admin (reportes/dashboard-kpis)
    print("\n[1] Solicitando Dashboard Admin (reportes/dashboard-kpis)...")
    try:
        admin_url = f"{BASE_URL}/api/reportes/dashboard-kpis?fecha={hoy}"
        admin_response = requests.get(admin_url, headers=headers, timeout=10)
        if admin_response.status_code == 200:
            admin_data = admin_response.json()
            print("✓ Dashboard Admin obtenido")
        else:
            print(f"✗ Error {admin_response.status_code}: {admin_response.text}")
            admin_data = None
    except Exception as e:
        print(f"✗ Error de conexión: {e}")
        admin_data = None
    
    # 2. Obtener datos del Dashboard Pedidos (dashboard/ventas-pedidos)
    print("\n[2] Solicitando Dashboard Pedidos (dashboard/ventas-pedidos)...")
    try:
        pedidos_url = f"{BASE_URL}/api/dashboard/ventas-pedidos"
        pedidos_response = requests.get(pedidos_url, headers=headers, timeout=10)
        if pedidos_response.status_code == 200:
            pedidos_data = pedidos_response.json()
            print("✓ Dashboard Pedidos obtenido")
        else:
            print(f"✗ Error {pedidos_response.status_code}: {pedidos_response.text}")
            pedidos_data = None
    except Exception as e:
        print(f"✗ Error de conexión: {e}")
        pedidos_data = None
    
    if not admin_data or not pedidos_data:
        print("\n✗ No se pudieron obtener ambos dashboards")
        return
    
    # 3. Comparar valores que DEBERÍAN coincidir
    print("\n" + "=" * 80)
    print("COMPARACIÓN DE VALORES")
    print("=" * 80)
    
    comparaciones = [
        ("Ingreso Puerta Hoy", 
         float(admin_data.get("primera_fila", {}).get("ingreso_puerta_hoy", 0)),
         float(pedidos_data.get("hoy", {}).get("ingreso_puerta_hoy", 0))),
        
        ("Ingreso Pedidos Hoy",
         float(admin_data.get("primera_fila", {}).get("ingreso_pedido_hoy", 0)),
         float(pedidos_data.get("hoy", {}).get("ingreso_pedidos_hoy", 0))),
        
        ("KGs Mañana",
         float(admin_data.get("primera_fila", {}).get("kgs_manana", 0)),
         float(pedidos_data.get("pendiente_entrega", {}).get("cantidad_kilos", 0))),
    ]
    
    print(f"\n{'MÉTRICA':<25} {'ADMIN':<20} {'PEDIDOS':<20} {'DIFERENCIA':<20}")
    print("-" * 85)
    
    hay_diferencias = False
    for metrica, admin_val, pedidos_val in comparaciones:
        diferencia = admin_val - pedidos_val
        estado = "✓" if abs(diferencia) < 0.01 else "✗"
        
        if abs(diferencia) >= 0.01:
            hay_diferencias = True
        
        print(f"{status} {metrica:<22} ${admin_val:>17,.2f} ${pedidos_val:>17,.2f} ${diferencia:>17,.2f}")
    
    # 4. Mostrar desglose por forma de pago (donde existan diferencias)
    print("\n" + "=" * 80)
    print("DESGLOSE POR FORMA DE PAGO - PUERTA (HOY)")
    print("=" * 80)
    
    admin_puerta = admin_data.get("primera_fila", {})
    pedidos_puerta = pedidos_data.get("hoy", {}).get("ingreso_puerta_por_forma_pago", {})
    
    print(f"\nAdminDashboard:")
    print(f"  Efectivo:      ${admin_puerta.get('puerta_efectivo', 0):>12,.2f}")
    print(f"  Transferencia: ${admin_puerta.get('puerta_transferencia', 0):>12,.2f}")
    print(f"  Factura:       ${admin_puerta.get('puerta_factura', 0):>12,.2f}")
    print(f"  TOTAL:         ${admin_puerta.get('ingreso_puerta_hoy', 0):>12,.2f}")
    
    print(f"\nDashboard Pedidos:")
    for forma, monto in pedidos_puerta.items():
        print(f"  {forma:<14}: ${float(monto):>12,.2f}")
    total_pedidos = sum(float(v) for v in pedidos_puerta.values())
    print(f"  TOTAL:         ${total_pedidos:>12,.2f}")
    
    print("\n" + "=" * 80)
    print("DESGLOSE POR FORMA DE PAGO - PEDIDOS (HOY)")
    print("=" * 80)
    
    admin_pedidos = {
        "Efectivo": float(admin_data.get("primera_fila", {}).get("pedido_efectivo", 0)),
        "Transferencia": float(admin_data.get("primera_fila", {}).get("pedido_transferencia", 0)),
        "Factura": float(admin_data.get("primera_fila", {}).get("pedido_factura", 0)),
    }
    pedidos_pedidos = pedidos_data.get("hoy", {}).get("ingreso_pedidos_por_forma_pago", {})
    
    print(f"\nAdminDashboard:")
    for forma, monto in admin_pedidos.items():
        print(f"  {forma:<14}: ${monto:>12,.2f}")
    total_admin = sum(admin_pedidos.values())
    print(f"  TOTAL:         ${total_admin:>12,.2f}")
    
    print(f"\nDashboard Pedidos:")
    for forma, monto in pedidos_pedidos.items():
        print(f"  {forma:<14}: ${float(monto):>12,.2f}")
    total_pedidos_ped = sum(float(v) for v in pedidos_pedidos.values())
    print(f"  TOTAL:         ${total_pedidos_ped:>12,.2f}")
    
    # 5. Resumen
    print("\n" + "=" * 80)
    if hay_diferencias:
        print("⚠️  ENCONTRADAS INCONSISTENCIAS - Ver detalles arriba")
    else:
        print("✓ Los dashboards coinciden en todos los valores")
    print("=" * 80)
    
    # 6. Guardar respuestas para análisis manual
    with open("/tmp/admin_dashboard.json", "w") as f:
        json.dump(admin_data, f, indent=2, default=str)
    with open("/tmp/pedidos_dashboard.json", "w") as f:
        json.dump(pedidos_data, f, indent=2, default=str)
    
    print("\nDatos guardados en:")
    print("  - /tmp/admin_dashboard.json")
    print("  - /tmp/pedidos_dashboard.json")

if __name__ == "__main__":
    # IMPORTANTE: Reemplaza con un token válido
    if TOKEN == "tu_token_aqui":
        print("ERROR: Debes reemplazar TOKEN con un token válido")
        print("Usa: TOKEN = '<tu_token_jwt>' en la línea 13")
        exit(1)
    
    test_dashboards()
