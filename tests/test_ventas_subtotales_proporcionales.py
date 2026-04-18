"""Reparto de monto final entre líneas de detalle (pedidos / DV / lote)."""

import importlib.util
import unittest
from decimal import Decimal
from pathlib import Path

_utils = Path(__file__).resolve().parents[1] / "backend" / "app" / "utils" / "ventas_montos_utils.py"
_spec = importlib.util.spec_from_file_location("ventas_montos_utils", _utils)
_mod = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_mod)
asignar_subtotales_proporcionales_en_detalles = _mod.asignar_subtotales_proporcionales_en_detalles


class TestSubtotalesProporcionales(unittest.TestCase):
    def test_suma_subtotales_igual_monto_final_tres_lineas(self):
        detalles = [
            {"precio_total_item_ars": 100.0},
            {"precio_total_item_ars": 100.0},
            {"precio_total_item_ars": 100.0},
        ]
        asignar_subtotales_proporcionales_en_detalles(detalles, 100.0, 300.0)
        s = sum(d["subtotal_proporcional_con_recargos"] for d in detalles)
        self.assertEqual(Decimal(str(s)), Decimal("100.00"))
        self.assertEqual(detalles[0]["subtotal_proporcional_con_recargos"], 33.33)
        self.assertEqual(detalles[1]["subtotal_proporcional_con_recargos"], 33.33)
        self.assertEqual(detalles[2]["subtotal_proporcional_con_recargos"], 33.34)

    def test_una_sola_linea(self):
        detalles = [{"precio_total_item_ars": 302500.0}]
        asignar_subtotales_proporcionales_en_detalles(detalles, 302500.0, 302500.0)
        self.assertEqual(detalles[0]["subtotal_proporcional_con_recargos"], 302500.0)

    def test_ultimo_slot_none_remanente_en_penultima_linea(self):
        """Si el último elemento de la lista es None, el remanente va a la última línea real."""
        detalles = [
            {"precio_total_item_ars": 100.0},
            {"precio_total_item_ars": 100.0},
            None,
        ]
        asignar_subtotales_proporcionales_en_detalles(detalles, 100.0, 200.0)
        s = sum(
            d["subtotal_proporcional_con_recargos"]
            for d in detalles
            if d is not None
        )
        self.assertEqual(Decimal(str(s)), Decimal("100.00"))
        self.assertEqual(detalles[0]["subtotal_proporcional_con_recargos"], 50.0)
        self.assertEqual(detalles[1]["subtotal_proporcional_con_recargos"], 50.0)

    def test_lista_vacia_no_rompe(self):
        asignar_subtotales_proporcionales_en_detalles([], 100.0, 100.0)

    def test_monto_final_none_limpia_campos(self):
        detalles = [
            {"precio_total_item_ars": 10.0, "subtotal_proporcional_con_recargos": 99.0},
        ]
        asignar_subtotales_proporcionales_en_detalles(detalles, None, 10.0)
        self.assertIsNone(detalles[0]["subtotal_proporcional_con_recargos"])

    def test_suma_precio_cero_pone_ceros(self):
        detalles = [{"precio_total_item_ars": 0}, {"precio_total_item_ars": 0}]
        asignar_subtotales_proporcionales_en_detalles(detalles, 100.0, 0.0)
        self.assertEqual(detalles[0]["subtotal_proporcional_con_recargos"], 0.0)
        self.assertEqual(detalles[1]["subtotal_proporcional_con_recargos"], 0.0)

    def test_monto_final_cero_pone_ceros(self):
        detalles = [{"precio_total_item_ars": 50.0}]
        asignar_subtotales_proporcionales_en_detalles(detalles, 0.0, 50.0)
        self.assertEqual(detalles[0]["subtotal_proporcional_con_recargos"], 0.0)

    def test_todos_los_slots_none_no_rompe(self):
        asignar_subtotales_proporcionales_en_detalles([None, None], 100.0, 100.0)

    def test_none_al_inicio_remanente_en_ultima_linea_real(self):
        detalles = [
            None,
            {"precio_total_item_ars": 30.0},
            {"precio_total_item_ars": 70.0},
        ]
        asignar_subtotales_proporcionales_en_detalles(detalles, 100.0, 100.0)
        self.assertEqual(detalles[1]["subtotal_proporcional_con_recargos"], 30.0)
        self.assertEqual(detalles[2]["subtotal_proporcional_con_recargos"], 70.0)
        s = detalles[1]["subtotal_proporcional_con_recargos"] + detalles[2][
            "subtotal_proporcional_con_recargos"
        ]
        self.assertEqual(Decimal(str(s)), Decimal("100.00"))
