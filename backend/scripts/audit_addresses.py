"""
Script de auditoría para direcciones vacías/nulas en clientes y ventas (pedidos).
Ejecutar desde la raíz del proyecto (dentro del virtualenv) así:
    python backend/scripts/audit_addresses.py

El script carga el contexto de Flask y consulta la base de datos usando los modelos.
Salida: imprime un resumen y genera archivos CSV en backend/scripts/output/.
"""
import os
import csv
import sys
from pathlib import Path

# Ajusta la ruta del paquete si es necesario
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

# Importa la app y db del proyecto
try:
    from backend.app import create_app, db
except Exception:
    # Intentar importaciones alternativas si la estructura difiere
    try:
        from app import create_app, db
    except Exception as e:
        print("No se pudo importar la aplicación Flask. Asegúrate de ejecutar desde la raíz del repo y tener el venv activado.")
        print(str(e))
        raise

from app.models import Cliente, Venta

OUT_DIR = PROJECT_ROOT / 'backend' / 'scripts' / 'output'
OUT_DIR.mkdir(parents=True, exist_ok=True)


def is_blank(value):
    if value is None:
        return True
    try:
        s = str(value).strip()
        return s == ''
    except Exception:
        return False


def audit():
    app = create_app()
    with app.app_context():
        # Clientes con direccion nula o vacía
        clientes_problem = Cliente.query.filter((Cliente.direccion == None) | (Cliente.direccion == '')).all()
        clientes_file = OUT_DIR / 'clientes_sin_direccion.csv'
        with open(clientes_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['id', 'nombre_razon_social', 'direccion', 'localidad', 'email', 'telefono'])
            for c in clientes_problem:
                writer.writerow([c.id, c.nombre_razon_social, c.direccion or '', c.localidad or '', c.email or '', c.telefono or ''])

        print(f"Clientes sin dirección: {len(clientes_problem)} -> {clientes_file}")

        # Ventas que son pedidos: asumimos que una venta es pedido si fecha_pedido IS NOT NULL
        ventas_pedidos_problem = Venta.query.filter(Venta.fecha_pedido != None).filter((Venta.direccion_entrega == None) | (Venta.direccion_entrega == '')).all()
        ventas_file = OUT_DIR / 'ventas_pedidos_sin_direccion.csv'
        with open(ventas_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['id', 'cliente_id', 'fecha_pedido', 'direccion_entrega', 'monto_total', 'nombre_vendedor'])
            for v in ventas_pedidos_problem:
                writer.writerow([v.id, v.cliente_id or '', v.fecha_pedido.isoformat() if v.fecha_pedido else '', v.direccion_entrega or '', str(v.monto_total) if v.monto_total else '', v.nombre_vendedor or ''])

        print(f"Ventas (pedidos) sin dirección de entrega: {len(ventas_pedidos_problem)} -> {ventas_file}")

        # Opcional: devolver conteos
        return {
            'clientes_sin_direccion': len(clientes_problem),
            'ventas_pedidos_sin_direccion': len(ventas_pedidos_problem),
            'clientes_file': str(clientes_file),
            'ventas_file': str(ventas_file)
        }


if __name__ == '__main__':
    try:
        result = audit()
        print('Auditoría completada.')
        print(result)
        sys.exit(0)
    except Exception as e:
        print('Error durante la auditoría:')
        print(str(e))
        sys.exit(2)
