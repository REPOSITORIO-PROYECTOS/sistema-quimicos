import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
compras_path = root / 'app' / 'blueprints' / 'compras.py'
recep_path = Path(__file__).resolve().parents[2] / 'frontend' / 'src' / 'app' / 'recepciones-pendientes' / 'page.tsx'

text = compras_path.read_text(encoding='utf-8')
ok_func = re.search(r"def\s+aprobar_orden_compra\(.*\):", text) is not None
ok_pend_recep = "orden_db.estado_recepcion = 'Pendiente'" in text
ok_estado_dual = "orden_db.estado = 'Con Deuda'" in text or "orden_db.estado = 'Aprobado'" in text

ftxt = recep_path.read_text(encoding='utf-8')
ok_filter = any(s in ftxt for s in ["EN_ESPERA_RECEPCION", "Con Deuda", "Aprobado"])  # soporta estados previos y duales

print(f"compras.py aprobar_orden_compra present={ok_func} recepcion_pendiente={ok_pend_recep} estado_dual={ok_estado_dual}")
print(f"recepciones-pendientes incluye filtros compatibles={ok_filter}")

assert ok_func and ok_pend_recep and ok_estado_dual, 'La aprobación no marca recepción pendiente y estado dual'
assert ok_filter, 'Recepciones Pendientes no filtra estados compatibles'
