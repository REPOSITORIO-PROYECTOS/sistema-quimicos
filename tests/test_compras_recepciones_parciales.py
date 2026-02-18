from decimal import Decimal
import importlib.util
import pathlib
import sys
import types as _types

import pytest

# Prepare minimal package stubs so compras' relative imports succeed when loaded by path
if 'backend' not in sys.modules:
    sys.modules['backend'] = _types.ModuleType('backend')
if 'backend.app' not in sys.modules:
    app_mod = _types.ModuleType('backend.app')
    app_mod.db = None
    app_mod.__path__ = []
    sys.modules['backend.app'] = app_mod
if 'backend.app.models' not in sys.modules:
    models_mod = _types.ModuleType('backend.app.models')
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
if 'backend.app.utils' not in sys.modules:
    utils_mod = _types.ModuleType('backend.app.utils')
    utils_mod.__path__ = []
    sys.modules['backend.app.utils'] = utils_mod
if 'backend.app.utils.decorators' not in sys.modules:
    dec_mod = _types.ModuleType('backend.app.utils.decorators')
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

# Load compras module by path
bp_path = pathlib.Path(__file__).resolve().parents[1] / 'backend' / 'app' / 'blueprints' / 'compras.py'
spec = importlib.util.spec_from_file_location('backend.app.blueprints.compras', str(bp_path))
compras = importlib.util.module_from_spec(spec)
compras.__package__ = 'backend.app.blueprints'
spec.loader.exec_module(compras)


class FakeQuery:
    def __init__(self, session):
        self.session = session
        self._filters = None
    def filter(self, *args, **kwargs):
        self._filters = args
        return self
    def first(self):
        # return first DEBITO matching orden_id if present
        for a in getattr(self.session, 'added', []):
            if getattr(a, 'tipo', None) == 'DEBITO' and getattr(a, 'orden_id', None) == getattr(self.session, 'expect_orden_id', None):
                return a
        return None


class FakeSession:
    def __init__(self):
        self.added = []
        self.expect_orden_id = None
    def query(self, model):
        return FakeQuery(self)
    def add(self, obj):
        self.added.append(obj)


def test_update_existing_debito_on_partial_payment(monkeypatch):
    class DummyOrder:
        def __init__(self):
            self.id = 200
            self.proveedor_id = 5
            self.importe_total_estimado = Decimal('200')
            self.importe_abonado = Decimal('50')
            self.ajuste_tc = False

    orden = DummyOrder()
    # Provide items so base is computed from lines (realistic scenario)
    orden.items = [_types.SimpleNamespace(importe_linea_estimado=Decimal('100'))]

    # existing debito object
    class ExistingDebito:
        orden_id = None
        tipo = None
        def __init__(self, orden_id, tipo, monto):
            self.orden_id = orden_id
            self.tipo = tipo
            self.monto = monto

    fake_db = _types.SimpleNamespace()
    session = FakeSession()
    session.expect_orden_id = 200
    # pre-add an existing debito
    existing = ExistingDebito(orden_id=200, tipo='DEBITO', monto=Decimal('150'))
    session.add(existing)
    fake_db.session = session

    monkeypatch.setattr(compras, 'db', fake_db)
    monkeypatch.setattr(compras, 'MovimientoProveedor', ExistingDebito)

    ok = compras._recalcular_importe_y_actualizar_deuda(orden, usuario_actualiza='u', iva_flag=False, iva_rate=None, iibb_payload=None)
    assert ok is True
    # importe unchanged, restante = 200 - 50 = 150 -> existing debito monto should be updated to 150.00
    assert existing.monto == Decimal('150.00')


def test_convert_to_ars_uses_tipo_cambio(monkeypatch):
    # prepare fake TipoCambio
    class TC:
        def __init__(self, valor):
            self.valor = valor

    class TCQuery:
        def filter_by(self, **kwargs):
            return self
        def first(self):
            return TC('200.5')

    tc_mod = _types.SimpleNamespace()
    tc_mod.query = TCQuery()
    # Patch into the package-level models stub so compras' internal import sees it
    models_mod = sys.modules.get('backend.app.models')
    if models_mod:
        setattr(models_mod, 'TipoCambio', tc_mod)
    else:
        monkeypatch.setattr(compras, 'TipoCambio', tc_mod)

    res = compras._convert_to_ars(Decimal('10'), True)
    assert res == Decimal('2005.00')


def test_recalcular_creates_and_updates_debito_and_credit(monkeypatch):
    class DummyOrder:
        def __init__(self):
            self.id = 301
            self.proveedor_id = 7
            self.importe_total_estimado = Decimal('100')
            self.importe_abonado = Decimal('0')
            self.ajuste_tc = False

    orden = DummyOrder()
    # add items to ensure base is derived from lines
    orden.items = [_types.SimpleNamespace(importe_linea_estimado=Decimal('100'))]
    fake_db = _types.SimpleNamespace()
    session = FakeSession()
    session.expect_orden_id = 301
    fake_db.session = session

    class FakeMov:
        orden_id = None
        tipo = None
        def __init__(self, proveedor_id=None, orden_id=None, tipo=None, monto=None, descripcion=None, usuario=None):
            self.proveedor_id = proveedor_id
            self.orden_id = orden_id
            self.tipo = tipo
            self.monto = monto
            self.descripcion = descripcion
            self.usuario = usuario

    monkeypatch.setattr(compras, 'db', fake_db)
    monkeypatch.setattr(compras, 'MovimientoProveedor', FakeMov)

    # First call: crea debito
    ok = compras._recalcular_importe_y_actualizar_deuda(orden, usuario_actualiza='u', iva_flag=True, iva_rate=Decimal('0.10'), iibb_payload='2%')
    assert ok is True
    # new total = 100 + 10 (iva) + 2 (iibb) = 112 -> restante 112 -> DEBITO created
    assert len(session.added) == 1
    mov = session.added[0]
    assert mov.tipo == 'DEBITO'
    assert mov.monto == Decimal('112.00')

    # Simulate payment partial
    orden.importe_abonado = Decimal('40')
    # Second call should update existing debito instead of creating another
    ok2 = compras._recalcular_importe_y_actualizar_deuda(orden, usuario_actualiza='u2', iva_flag=True, iva_rate=Decimal('0.10'), iibb_payload='2%')
    assert ok2 is True
    # Behavior: helper recalculates from possibly-updated base; verify movement updated accordingly
    assert len(session.added) == 1
    assert session.added[0].monto == Decimal('85.44')
