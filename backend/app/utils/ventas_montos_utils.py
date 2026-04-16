"""Cálculos de montos para serialización de ventas (sin dependencias Flask)."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any, List, Optional


def asignar_subtotales_proporcionales_en_detalles(
    detalles: List[Optional[dict[str, Any]]],
    monto_final: Optional[float],
    suma_precio_items: float,
) -> None:
    """
    Reparte monto_final entre líneas en proporción a precio_total_item_ars.
    Redondea cada línea a centavos salvo la última, que absorbe el remanente
    para que la suma coincida exactamente con monto_final.
    """
    if not detalles:
        return
    if monto_final is None:
        for d in detalles:
            if d is not None:
                d["subtotal_proporcional_con_recargos"] = None
        return
    base = Decimal(str(suma_precio_items))
    mf = Decimal(str(monto_final))
    if base <= 0 or mf <= 0:
        for d in detalles:
            if d is not None:
                d["subtotal_proporcional_con_recargos"] = 0.0
        return
    acc = Decimal("0.00")
    n = len(detalles)
    for i, d in enumerate(detalles):
        if d is None:
            continue
        precio = Decimal(str(d.get("precio_total_item_ars") or 0))
        if i < n - 1:
            part = (mf * precio / base).quantize(Decimal("0.01"), ROUND_HALF_UP)
            acc += part
        else:
            part = (mf - acc).quantize(Decimal("0.01"), ROUND_HALF_UP)
        d["subtotal_proporcional_con_recargos"] = float(part)
