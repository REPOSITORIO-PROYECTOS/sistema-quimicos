from types import SimpleNamespace
from decimal import Decimal

from types import SimpleNamespace as SN

from app.blueprints import compras as compras_module
from app.models import OrdenCompra


class FakeOrden:
    def __init__(self):
        self.id = 1
        self.proveedor_id = 10
        self.estado = 'Solicitado'
        self.items = []
        self.importe_total_estimado = Decimal('1000')
        self.importe_abonado = Decimal('0')
        self.fecha_aprobacion = None
        self.aprobado_por = None


class FakeQuery:
    def __init__(self, model):
        self.model = model
        self._fake_orden = FakeOrden() if model is OrdenCompra else None

    def options(self, *args, **kwargs):
        return self

    def get(self, _id):
        return self._fake_orden

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return None


class FakeSession:
    def query(self, model):
        return FakeQuery(model)

    def add(self, obj):
        pass

    def commit(self):
        pass


def run_test():
    compras_module.db.session = FakeSession()

    # Monkeypatch request used inside the view
    compras_module.request = SN(json={'importe_total_estimado': 1000}, headers={'X-User-Role': 'ADMIN', 'X-User-Name': 'Tester'})

    fn = compras_module.aprobar_orden_compra.__wrapped__.__wrapped__
    fake_user = SN(id=1, username='tester', role='ADMIN')
    resp = fn(fake_user, 1)
    status = getattr(resp, 'status_code', None)
    estado = compras_module.db.session.query(OrdenCompra)._fake_orden.estado
    print(f"status={status} estado={estado}")
    assert estado == 'EN_ESPERA_RECEPCION', 'La orden no quedó pendiente de recepción'


if __name__ == '__main__':
    run_test()
