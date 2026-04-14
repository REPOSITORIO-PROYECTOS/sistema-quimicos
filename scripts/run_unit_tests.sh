#!/usr/bin/env bash
# Tests que no requieren MySQL local (evita fallos de conexión en CI / dev sin DB).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ ! -x .venv/bin/python ]]; then
  echo "Creá el venv: python3 -m venv .venv && .venv/bin/python -m pip install -r backend/requirements.txt" >&2
  exit 1
fi
exec .venv/bin/python -m pytest \
  tests/test_aprobar_cantidad_no_cero.py \
  tests/test_code_structure.py \
  tests/test_compare_dashboards.py \
  tests/test_compilation.py \
  tests/test_compras_iva_iibb.py \
  tests/test_localidad_in_reportes.py \
  tests/test_cors_backend.py \
  tests/test_pedido_rapido_compras.py \
  tests/test_validacion_logica.py \
  tests/test_ordenes_db_smoke.py \
  -v --tb=short "$@"
