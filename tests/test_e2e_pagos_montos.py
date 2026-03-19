#!/usr/bin/env python3
"""
E2E de pagos de ordenes de compra (monto y saldo pendiente).

Este test:
1. Crea una orden de prueba con deuda.
2. Valida rechazo de monto cero.
3. Valida sobrepago: backend debe ajustar al saldo pendiente y cerrar deuda.
4. Valida rechazo cuando la orden ya no tiene saldo.
5. Limpia datos de prueba (orden y movimientos).

Ejecutar:
  python3 tests/test_e2e_pagos_montos.py

Opcionales por entorno:
  E2E_BASE_URL=http://127.0.0.1:5000
"""

import os
import sys
import datetime
from decimal import Decimal

import jwt
import requests

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_PATH = os.path.join(REPO_ROOT, "backend")
if BACKEND_PATH not in sys.path:
    sys.path.insert(0, BACKEND_PATH)

from app import create_app, db  # noqa: E402
from app.models import OrdenCompra, Proveedor, UsuarioInterno, MovimientoProveedor  # noqa: E402

JWT_SECRET = "J2z8KJdN8UfU8g6wKXgk4Q6nfsDF8wMnezLp8xsdWbNQqZ4RkOzZulX8wA=="
BASE_URL = os.getenv("E2E_BASE_URL", "http://127.0.0.1:5000").rstrip("/")


def _build_token(user_id: int, rol: str) -> str:
    payload = {
        "user_id": user_id,
        "rol": rol,
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _pick_user_and_token() -> tuple[UsuarioInterno, str]:
    user = (
        UsuarioInterno.query.filter(UsuarioInterno.rol.in_(["ADMIN", "CONTABLE"]))
        .order_by(UsuarioInterno.id.asc())
        .first()
    )
    if not user:
        raise RuntimeError("No hay usuario ADMIN/CONTABLE para ejecutar el test E2E")
    return user, _build_token(user.id, user.rol)


def _create_order_with_debt() -> OrdenCompra:
    proveedor = Proveedor.query.order_by(Proveedor.id.asc()).first()
    if not proveedor:
        raise RuntimeError("No hay proveedores en la base para crear orden de prueba")

    # Total 1000, abonado 200 -> saldo 800
    orden = OrdenCompra(
        nro_solicitud_interno=f"E2E-PAGOS-{datetime.datetime.now().strftime('%Y%m%d%H%M%S%f')}",
        proveedor_id=proveedor.id,
        estado="CON DEUDA",
        importe_total_estimado=Decimal("1000.00"),
        importe_abonado=Decimal("200.00"),
        forma_pago="Efectivo",
        ajuste_tc=False,
    )
    db.session.add(orden)
    db.session.commit()
    return orden


def _delete_order_and_movements(order_id: int) -> None:
    MovimientoProveedor.query.filter_by(orden_id=order_id).delete()
    orden = db.session.get(OrdenCompra, order_id)
    if orden:
        db.session.delete(orden)
    db.session.commit()


def main() -> int:
    app = create_app()

    print("=" * 90)
    print("E2E PAGOS ORDENES COMPRA - VALIDACION DE MONTOS")
    print("=" * 90)
    print(f"BASE_URL: {BASE_URL}")

    with app.app_context():
        orden = None
        try:
            user, token = _pick_user_and_token()
            orden = _create_order_with_debt()

            print(f"Usuario de prueba: id={user.id}, rol={user.rol}, nombre={user.nombre_usuario}")
            print(
                f"Orden de prueba creada: id={orden.id}, total={orden.importe_total_estimado}, abonado={orden.importe_abonado}"
            )

            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "X-User-Role": user.rol,
                "X-User-Name": user.nombre_usuario,
            }

            # Caso 1: monto invalido (0)
            res_zero = requests.post(
                f"{BASE_URL}/api/ordenes_compra/pagos/{orden.id}",
                headers=headers,
                json={"monto": 0, "forma_pago": "Efectivo"},
                timeout=15,
            )
            print(f"Caso 1 (monto 0): status={res_zero.status_code}")
            assert res_zero.status_code == 400, f"Esperado 400, recibido {res_zero.status_code}"

            # Caso 2: sobrepago (debe ajustar al saldo 800)
            res_overpay = requests.post(
                f"{BASE_URL}/api/ordenes_compra/pagos/{orden.id}",
                headers=headers,
                json={
                    "monto": 1200,
                    "forma_pago": "Efectivo",
                    "referencia_pago": "E2E sobrepago",
                },
                timeout=15,
            )
            data_overpay = res_overpay.json()
            print(f"Caso 2 (sobrepago): status={res_overpay.status_code}, pago_ajustado={data_overpay.get('pago_ajustado')}")
            assert res_overpay.status_code in (200, 201), (
                f"Esperado 200/201, recibido {res_overpay.status_code}"
            )
            assert data_overpay.get("pago_ajustado") is True, "Se esperaba pago_ajustado=True"

            orden_actualizada = data_overpay.get("orden") or {}
            abonado_final = Decimal(str(orden_actualizada.get("importe_abonado", "0")))
            total = Decimal(str(orden_actualizada.get("importe_total_estimado", "0")))
            assert abonado_final == total == Decimal("1000.00"), (
                f"Monto final incorrecto. total={total}, abonado={abonado_final}"
            )

            # Caso 3: sin saldo pendiente (debe rechazar)
            res_no_balance = requests.post(
                f"{BASE_URL}/api/ordenes_compra/pagos/{orden.id}",
                headers=headers,
                json={"monto": 10, "forma_pago": "Efectivo"},
                timeout=15,
            )
            print(f"Caso 3 (sin saldo): status={res_no_balance.status_code}")
            assert res_no_balance.status_code == 409, (
                f"Esperado 409 cuando no hay saldo, recibido {res_no_balance.status_code}"
            )

            print("\nRESULTADO: OK - E2E de montos en pagos aprobado")
            return 0

        except Exception as exc:
            print(f"\nRESULTADO: FAIL - {exc}")
            return 1

        finally:
            if orden is not None:
                try:
                    _delete_order_and_movements(orden.id)
                    print(f"Limpieza OK: orden {orden.id} y movimientos eliminados")
                except Exception as cleanup_exc:
                    print(f"Advertencia en limpieza: {cleanup_exc}")


if __name__ == "__main__":
    raise SystemExit(main())
