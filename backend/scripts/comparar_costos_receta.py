from __future__ import annotations

import argparse
import sys
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

# Permite ejecutar el script desde la raiz del repo: python3 backend/scripts/...
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
	sys.path.insert(0, str(BACKEND_DIR))

from app import create_app
from app.models import Producto
from app.blueprints.productos import calcular_costo_producto_referencia


def parse_decimal(value: str | int | float | None) -> Decimal:
	"""Parsea numeros con coma o punto decimal; vacio -> 0."""
	if value is None:
		return Decimal("0")
	raw = str(value).strip()
	if raw == "":
		return Decimal("0")
	raw = raw.replace("%", "").replace(",", ".")
	return Decimal(raw)


def q(value: Decimal, digits: str = "0.0001") -> Decimal:
	return value.quantize(Decimal(digits), rounding=ROUND_HALF_UP)


def calcular_costo_receta(items: list[dict[str, str]]) -> tuple[list[dict[str, Decimal | str]], Decimal]:
	"""
	Replica la logica de Excel: SUMAPRODUCTO(costos, porcentajes) / 100.
	Equivalente: sum(costo * (porcentaje / 100)).
	"""
	detalle: list[dict[str, Decimal | str]] = []
	total = Decimal("0")

	for item in items:
		nombre = item["ingrediente"]
		costo = parse_decimal(item.get("costo_unitario"))
		porcentaje = parse_decimal(item.get("porcentaje"))
		aporte = costo * (porcentaje / Decimal("100"))
		total += aporte
		detalle.append(
			{
				"ingrediente": nombre,
				"costo_unitario": q(costo),
				"porcentaje": q(porcentaje),
				"aporte": q(aporte),
			}
		)

	return detalle, q(total)


def obtener_producto_desde_sistema(producto_id: int | None, producto_nombre: str | None) -> Producto:
	if producto_id is not None:
		producto = Producto.query.get(producto_id)
		if not producto:
			raise ValueError(f"No existe producto con id {producto_id}")
		return producto

	if producto_nombre:
		producto = Producto.query.filter(Producto.nombre.ilike(producto_nombre.strip())).first()
		if not producto:
			producto = Producto.query.filter(Producto.nombre.ilike(f"%{producto_nombre.strip()}%")).first()
		if not producto:
			raise ValueError(f"No existe producto con nombre similar a '{producto_nombre}'")
		return producto

	raise ValueError("Debes indicar --producto-id o --producto-nombre")


def construir_items_desde_sistema(producto: Producto) -> tuple[list[dict[str, str]], Decimal]:
	if not producto.es_receta or not producto.receta:
		raise ValueError(f"El producto '{producto.nombre}' no tiene receta activa")

	items_receta = producto.receta.items.all() if hasattr(producto.receta.items, "all") else producto.receta.items
	total_porcentaje = Decimal("0")
	items: list[dict[str, str]] = []

	for item in items_receta:
		if not item.ingrediente:
			continue
		porcentaje = Decimal(item.porcentaje or "0")
		total_porcentaje += porcentaje

		# Misma logica del sistema para costo unitario USD (respeta subrecetas y override).
		costo_sistema_ingrediente = calcular_costo_producto_referencia(item.ingrediente.id)
		items.append(
			{
				"ingrediente": item.ingrediente.nombre,
				"costo_unitario": str(costo_sistema_ingrediente),
				"porcentaje": str(porcentaje),
			}
		)

	return items, total_porcentaje


def imprimir_resultado(
	detalle: list[dict[str, Decimal | str]],
	total: Decimal,
	objetivos: list[Decimal],
	margen: Decimal | None,
	tc: Decimal | None,
	producto_nombre: str,
	total_backend: Decimal,
	total_porcentaje: Decimal,
) -> None:
	print("\n=== Comparacion de costos de receta ===")
	print(f"Producto: {producto_nombre}")
	print(f"Suma de porcentajes receta: {q(total_porcentaje)}%")
	print("Ingrediente                 Costo Unit.   % Receta     Aporte")
	print("-" * 62)
	for row in detalle:
		print(
			f"{str(row['ingrediente']):<26}"
			f"{str(row['costo_unitario']):>11}   "
			f"{str(row['porcentaje']):>8}%   "
			f"{str(row['aporte']):>9}"
		)
	print("-" * 62)
	print(f"Costo total receta (USD): {total}")
	print(f"Costo total backend (USD): {q(total_backend)}")
	print(f"Diferencia script-backend: {q(total - q(total_backend))}")

	if objetivos:
		print("\nComparacion contra objetivos:")
		for objetivo in objetivos:
			diff = q(total - objetivo)
			base = objetivo if objetivo != 0 else Decimal("1")
			diff_pct = q((diff / base) * Decimal("100"), "0.01")
			estado = "MAYOR" if diff > 0 else ("MENOR" if diff < 0 else "IGUAL")
			print(f"- Objetivo {objetivo}: diferencia {diff} ({diff_pct}%) -> {estado}")

	if margen is not None:
		if margen >= Decimal("1") or margen < Decimal("0"):
			print("\nMargen invalido: debe estar entre 0 y 1 (ej: 0.39)")
		else:
			precio_base_usd = q(total / (Decimal("1") - margen), "0.0001")
			print(f"\nPrecio base con margen {margen}: USD {precio_base_usd}")
			if tc is not None:
				costo_ars = q(total * tc, "0.01")
				precio_base_ars = q(precio_base_usd * tc, "0.01")
				print(f"Costo convertido a ARS (TC={tc}): {costo_ars}")
				print(f"Precio base ARS (con margen): {precio_base_ars}")


def main() -> int:
	parser = argparse.ArgumentParser(
		description="Compara costos de una receta tomando costos del sistema (DB) contra valores objetivo."
	)
	parser.add_argument("--producto-id", type=int, default=None, help="ID de producto receta en sistema")
	parser.add_argument("--producto-nombre", default=None, help="Nombre del producto receta en sistema")
	parser.add_argument(
		"--objetivo",
		action="append",
		default=["0.80", "0.77"],
		help="Costo objetivo a comparar. Se puede repetir. Ej: --objetivo 0.80 --objetivo 0.77",
	)
	parser.add_argument(
		"--margen",
		default=None,
		help="Margen en fraccion (ej: 0.39 para 39%).",
	)
	parser.add_argument(
		"--tc",
		default=None,
		help="Tipo de cambio para convertir USD a ARS (opcional).",
	)
	args = parser.parse_args()

	try:
		app = create_app()
		objetivos = [parse_decimal(o) for o in args.objetivo]
		margen = parse_decimal(args.margen) if args.margen is not None else None
		tc = parse_decimal(args.tc) if args.tc is not None else None

		with app.app_context():
			producto = obtener_producto_desde_sistema(args.producto_id, args.producto_nombre)
			items, total_porcentaje = construir_items_desde_sistema(producto)
			detalle, total = calcular_costo_receta(items)
			total_backend = calcular_costo_producto_referencia(producto.id)
			imprimir_resultado(
				detalle,
				total,
				objetivos,
				margen,
				tc,
				producto.nombre,
				total_backend,
				total_porcentaje,
			)
	except InvalidOperation as exc:
		print(f"Error al parsear numeros: {exc}")
		return 1
	except ValueError as exc:
		print(f"Error de validacion: {exc}")
		return 1
	except Exception as exc:
		print(f"Error consultando sistema: {exc}")
		return 1

	return 0


if __name__ == "__main__":
	raise SystemExit(main())
