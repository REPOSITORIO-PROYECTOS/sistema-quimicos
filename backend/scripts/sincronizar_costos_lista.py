from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

# Permite ejecutar desde la raiz del repo: python3 backend/scripts/...
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import create_app
from app import db
from app.models import Producto
from app.blueprints.productos import calcular_costo_producto_referencia


def q4(value: Decimal | None) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


@dataclass
class CambioCosto:
    producto_id: int
    nombre: str
    costo_actual: Decimal
    costo_calculado: Decimal


def sincronizar_costos_recetas(aplicar: bool, limite: int | None = None) -> tuple[int, int, list[CambioCosto], list[str]]:
    productos = Producto.query.filter_by(es_receta=True).order_by(Producto.id).all()
    revisados = 0
    actualizados = 0
    cambios: list[CambioCosto] = []
    errores: list[str] = []

    for producto in productos:
        if limite is not None and revisados >= limite:
            break

        revisados += 1
        try:
            costo_calc = q4(calcular_costo_producto_referencia(producto.id))
            costo_actual = q4(producto.costo_referencia_usd)

            if costo_actual != costo_calc:
                cambios.append(
                    CambioCosto(
                        producto_id=producto.id,
                        nombre=producto.nombre,
                        costo_actual=costo_actual,
                        costo_calculado=costo_calc,
                    )
                )

                if aplicar:
                    producto.costo_referencia_usd = costo_calc
                    producto.fecha_actualizacion_costo = datetime.now(timezone.utc)
                    actualizados += 1
        except Exception as exc:
            errores.append(f"ID {producto.id} ({producto.nombre}): {exc}")

    if aplicar:
        db.session.commit()

    return revisados, actualizados, cambios, errores


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sincroniza costo_referencia_usd de recetas para que la lista muestre costos actualizados."
    )
    parser.add_argument(
        "--aplicar",
        action="store_true",
        help="Aplica cambios en base de datos. Sin esta bandera solo informa (dry-run).",
    )
    parser.add_argument(
        "--limite",
        type=int,
        default=None,
        help="Limita la cantidad de recetas a revisar.",
    )
    args = parser.parse_args()

    # Valores por defecto para correr local contra docker-compose
    os.environ.setdefault("DB_HOST", "localhost")
    os.environ.setdefault("DB_USER", "quimex")
    os.environ.setdefault("DB_PASSWORD", "QuimexApp_Pass123")
    os.environ.setdefault("DB_PORT", "3306")
    os.environ.setdefault("DB_NAME", "quimex_db")

    app = create_app()
    with app.app_context():
        revisados, actualizados, cambios, errores = sincronizar_costos_recetas(
            aplicar=args.aplicar,
            limite=args.limite,
        )

    modo = "APLICADO" if args.aplicar else "DRY-RUN"
    print(f"\n=== Sincronizacion costos lista ({modo}) ===")
    print(f"Recetas revisadas: {revisados}")
    print(f"Recetas con diferencia: {len(cambios)}")
    if args.aplicar:
        print(f"Recetas actualizadas: {actualizados}")

    if cambios:
        print("\nDetalle de diferencias:")
        for c in cambios[:50]:
            print(
                f"- ID {c.producto_id} | {c.nombre} | actual={c.costo_actual} -> calculado={c.costo_calculado}"
            )
        if len(cambios) > 50:
            print(f"... y {len(cambios) - 50} mas")

    if errores:
        print("\nErrores de calculo:")
        for err in errores:
            print(f"- {err}")

    return 0 if not errores else 2


if __name__ == "__main__":
    raise SystemExit(main())
