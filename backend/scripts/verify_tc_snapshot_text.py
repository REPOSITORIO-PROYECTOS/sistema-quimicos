from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / 'app' / 'blueprints' / 'compras.py'
t = p.read_text(encoding='utf-8')

checks = [
    "__TC_SNAPSHOT__:" in t,
    "observaciones_solicitud" in t,
    "notas_recepcion" in t,
]

print("tc_snapshot_present=", checks[0])
print("observaciones_solicitud_updated=", checks[1])
print("notas_recepcion_updated=", checks[2])

assert all(checks), 'Faltan persistencias de TC en compras.py'

