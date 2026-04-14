"""
Smoke test opcional contra MySQL real.

Requiere: pip install pymysql (o el venv del backend).

Ejecutar:
  QUIMEX_DB_SMOKE=1 DB_HOST=127.0.0.1 DB_USER=quimex DB_PASSWORD=... DB_NAME=quimex_db \\
    pytest tests/test_ordenes_db_smoke.py -v
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

pytest.importorskip("pymysql")

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "backend" / "scripts" / "verificar_ordenes_db.py"


@pytest.mark.skipif(
    os.environ.get("QUIMEX_DB_SMOKE") != "1",
    reason="Definí QUIMEX_DB_SMOKE=1 y DB_HOST/DB_USER/DB_PASSWORD/DB_NAME para probar contra la DB",
)
def test_script_verificar_ordenes_db_exit_code():
    env = os.environ.copy()
    assert SCRIPT.is_file(), f"Falta el script: {SCRIPT}"
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), "--limit", "5"],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert proc.returncode == 0, f"stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"


@pytest.mark.skipif(
    os.environ.get("QUIMEX_DB_SMOKE") != "1",
    reason="Definí QUIMEX_DB_SMOKE=1 para consultar la DB",
)
def test_mysql_ordenes_tienen_acceso_basico():
    import pymysql

    conn = pymysql.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ.get("DB_USER", "quimex"),
        password=os.environ.get("DB_PASSWORD", ""),
        database=os.environ.get("DB_NAME", "quimex_db"),
        charset="utf8mb4",
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM ordenes_compra")
            assert cur.fetchone()[0] >= 0
            cur.execute("SELECT COUNT(*) FROM detalles_orden_compra")
            assert cur.fetchone()[0] >= 0
    finally:
        conn.close()
