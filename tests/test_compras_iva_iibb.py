from decimal import Decimal
import types
import importlib.util
import pathlib
import sys
import types as _types

# Prepare minimal package stubs so compras' relative imports succeed when loaded by path
if 'backend' not in sys.modules:
    sys.modules['backend'] = _types.ModuleType('backend')
if 'backend.app' not in sys.modules:
    app_mod = _types.ModuleType('backend.app')
    # provide a placeholder db attribute; tests will monkeypatch compras.db anyway
    app_mod.db = None
    # Mark as package
    app_mod.__path__ = []
    sys.modules['backend.app'] = app_mod
if 'backend.app.models' not in sys.modules:
    models_mod = _types.ModuleType('backend.app.models')
    # minimal placeholders for names imported by compras
    class _Stub: pass
    models_mod.OrdenCompra = _Stub
    models_mod.DetalleOrdenCompra = _Stub
    models_mod.Producto = _Stub
    models_mod.Proveedor = _Stub
    models_mod.TipoCambio = _Stub
    models_mod.AuditLog = _Stub
    models_mod.MovimientoProveedor = _Stub
    sys.modules['backend.app.models'] = models_mod
if 'backend.app.blueprints' not in sys.modules:
    sys.modules['backend.app.blueprints'] = _types.ModuleType('backend.app.blueprints')
# Provide minimal utils modules required by compras imports
if 'backend.app.utils' not in sys.modules:
    utils_mod = _types.ModuleType('backend.app.utils')
    utils_mod.__path__ = []
    sys.modules['backend.app.utils'] = utils_mod
if 'backend.app.utils.decorators' not in sys.modules:
    dec_mod = _types.ModuleType('backend.app.utils.decorators')
    # No-op decorators to satisfy imports
    def token_required(f):
        return f
    def roles_required(*args, **kwargs):
        def _d(f):
            return f
        return _d
    dec_mod.token_required = token_required
    dec_mod.roles_required = roles_required
    sys.modules['backend.app.utils.decorators'] = dec_mod
if 'backend.app.utils.permissions' not in sys.modules:
    perm_mod = _types.ModuleType('backend.app.utils.permissions')
    perm_mod.ROLES = {'ADMIN': 'ADMIN', 'ALMACEN': 'ALMACEN', 'CONTABLE': 'CONTABLE'}
    sys.modules['backend.app.utils.permissions'] = perm_mod

import pytest

# Load compras module directly by path to avoid package import side-effects
bp_path = pathlib.Path(__file__).resolve().parents[1] / 'backend' / 'app' / 'blueprints' / 'compras.py'
spec = importlib.util.spec_from_file_location('backend.app.blueprints.compras', str(bp_path))
compras = importlib.util.module_from_spec(spec)
# Ensure the package parent is registered so relative imports work
compras.__package__ = 'backend.app.blueprints'
spec.loader.exec_module(compras)


def test_parse_iibb_rate_various():
    assert compras._parse_iibb_rate('3%') == Decimal('0.03')
    assert compras._parse_iibb_rate('0.03') == Decimal('0.03')
    assert compras._parse_iibb_rate('3') == Decimal('0.03')
    assert compras._parse_iibb_rate(None) == Decimal('0')
    assert compras._parse_iibb_rate(0.5) == Decimal('0.5')


def test_recalcular_crea_mov_debito_and_actualiza_total(monkeypatch):
    # Prepare a dummy order object
    class DummyOrder:
        def __init__(self):
            self.id = 123
            self.proveedor_id = 99
            self.importe_total_estimado = Decimal('100')
            self.importe_abonado = Decimal('20')
            self.ajuste_tc = False

    orden = DummyOrder()

    # Fake MovimientoProveedor class to capture constructed instances
    created = {}

    class FakeMov:
        # provide class-level attributes so compras' query/filter expressions don't fail
        orden_id = None
        tipo = None
        def __init__(self, proveedor_id=None, orden_id=None, tipo=None, monto=None, descripcion=None, usuario=None):
            self.proveedor_id = proveedor_id
            self.orden_id = orden_id
            self.tipo = tipo
            self.monto = monto
            self.descripcion = descripcion
            self.usuario = usuario

    # Fake session and query to simulate no existing debito
    class FakeQuery:
        def __init__(self, session):
            self.session = session
        def filter(self, *args, **kwargs):
            return self
        def first(self):
            return None

    class FakeSession:
        def __init__(self):
            self.added = []
        def query(self, model):
            return FakeQuery(self)
        def add(self, obj):
            self.added.append(obj)

    fake_db = types.SimpleNamespace()
    fake_db.session = FakeSession()

    # Monkeypatch the compras module db and MovimientoProveedor
    monkeypatch.setattr(compras, 'db', fake_db)
    monkeypatch.setattr(compras, 'MovimientoProveedor', FakeMov)

    # Call the helper: base=100, iva 21% -> 21, iibb 3% -> 3 => nuevo_total 124
    ok = compras._recalcular_importe_y_actualizar_deuda(orden, usuario_actualiza='tester', iva_flag=True, iva_rate=Decimal('0.21'), iibb_payload='3%')
    assert ok is True
    assert orden.importe_total_estimado == Decimal('124.00')

    # restante = 124 - 20 = 104 -> should have created a DEBITO Movimiento with monto 104.00
    assert len(fake_db.session.added) == 1
    mov = fake_db.session.added[0]
    assert mov.tipo == 'DEBITO'
    assert mov.monto == Decimal('104.00')
