"""
Regresión: al aprobar, no debe aplicarse cantidad_solicitada = 0 si la línea ya tenía cantidad > 0.

La lógica vive en `backend/app/blueprints/compras.py` → `aprobar_orden_compra`
(actualización de items: solo asigna nuevo_qty si `nuevo_qty > 0 or prev_qty <= 0`).

Ejecutar: `python3 -m unittest tests.test_aprobar_cantidad_no_cero -v`
(o con pytest si está instalado: `pytest tests/test_aprobar_cantidad_no_cero.py`).
"""
from __future__ import annotations

import unittest
from decimal import Decimal


def debe_actualizar_cantidad_solicitada(nuevo_qty: Decimal, prev_qty: Decimal) -> bool:
    """Espejo de la condición usada en aprobar_orden_compra."""
    return nuevo_qty > 0 or prev_qty <= 0


class TestAprobarCantidadNoCero(unittest.TestCase):
    def test_no_pisa_cantidad_positiva_con_cero(self):
        self.assertFalse(debe_actualizar_cantidad_solicitada(Decimal("0"), Decimal("1000")))

    def test_aplica_cantidad_positiva(self):
        self.assertTrue(debe_actualizar_cantidad_solicitada(Decimal("500"), Decimal("1000")))
        self.assertTrue(debe_actualizar_cantidad_solicitada(Decimal("100"), Decimal("0")))

    def test_permite_corregir_linea_que_estaba_en_cero(self):
        self.assertTrue(debe_actualizar_cantidad_solicitada(Decimal("0"), Decimal("0")))


if __name__ == "__main__":
    unittest.main()
