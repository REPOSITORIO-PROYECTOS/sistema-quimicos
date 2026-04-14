#!/usr/bin/env python3
"""
Lee órdenes de compra desde MySQL (solo pymysql) y valida datos de líneas.

Variables de entorno (como docker-compose):
  DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME

Uso:
  python3 backend/scripts/verificar_ordenes_db.py
  python3 backend/scripts/verificar_ordenes_db.py --limit 15
"""
from __future__ import annotations

import argparse
import os
import sys
from decimal import Decimal


def _dec(v) -> Decimal:
    if v is None:
        return Decimal("0")
    return Decimal(str(v))


def main() -> int:
    parser = argparse.ArgumentParser(description="Verificar órdenes de compra en MySQL")
    parser.add_argument("--limit", type=int, default=12, help="Órdenes más recientes")
    args = parser.parse_args()

    try:
        import pymysql
    except ImportError:
        print("Instalá dependencias: pip install pymysql")
        return 1

    host = os.environ.get("DB_HOST", "127.0.0.1")
    port = int(os.environ.get("DB_PORT", "3306"))
    user = os.environ.get("DB_USER", "quimex")
    password = os.environ.get("DB_PASSWORD", "")
    database = os.environ.get("DB_NAME", "quimex_db")

    try:
        conn = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
        )
    except Exception as e:
        print("ERROR: No se pudo conectar a MySQL.")
        print(f"  {host}:{port} db={database} user={user}")
        print(f"  {e}")
        return 1

    with conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM ordenes_compra")
            total = cur.fetchone()["c"]
            print(f"OK conexión. Total ordenes_compra: {total}\n")

            cur.execute(
                """
                SELECT oc.id, oc.estado, oc.estado_recepcion, p.nombre AS proveedor_nombre
                FROM ordenes_compra oc
                LEFT JOIN proveedores p ON p.id = oc.proveedor_id
                ORDER BY oc.id DESC
                LIMIT %s
                """,
                (args.limit,),
            )
            ordenes = cur.fetchall()

            problemas = 0
            for row in ordenes:
                oid = row["id"]
                print(
                    f"OC #{oid:04d}  estado={row['estado']!r}  recepción={row['estado_recepcion']!r}  "
                    f"proveedor={row.get('proveedor_nombre') or '?'}"
                )
                cur.execute(
                    """
                    SELECT d.id, d.cantidad_solicitada, d.cantidad_recibida, pr.nombre AS producto_nombre
                    FROM detalles_orden_compra d
                    LEFT JOIN productos pr ON pr.id = d.producto_id
                    WHERE d.orden_id = %s
                    ORDER BY d.id
                    """,
                    (oid,),
                )
                items = cur.fetchall()
                if not items:
                    print("  [!] Sin filas en detalles_orden_compra")
                    problemas += 1
                    continue
                for it in items:
                    sol = _dec(it.get("cantidad_solicitada"))
                    rec = _dec(it.get("cantidad_recibida"))
                    nom = it.get("producto_nombre") or f"producto_id=? id_linea={it['id']}"
                    marcas = []
                    if sol <= 0:
                        marcas.append("cantidad_solicitada<=0")
                    if rec > sol:
                        marcas.append("recibida>solicitada")
                    suf = f"  ** {'; '.join(marcas)} **" if marcas else ""
                    print(f"    - {nom}: solicitada={sol} recibida={rec}{suf}")
                    if marcas:
                        problemas += 1
                print()

            print("---")
            if problemas:
                print(f"Líneas con advertencias: {problemas}")
            else:
                print("Sin advertencias en el muestreo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
