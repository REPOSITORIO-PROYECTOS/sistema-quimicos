from decimal import Decimal, InvalidOperation

from app import create_app, db
from app.models import TipoCambio


def _normalizar_valor(raw):
    try:
        value = Decimal(str(raw))
        if value <= 0:
            raise ValueError("El valor debe ser mayor a 0")
        return value.quantize(Decimal('0.01'))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"Valor invalido para DolarCompras: {raw}")


def seed_dolar_compras(valor=None):
    tc_existente = TipoCambio.query.filter_by(nombre='DolarCompras').first()
    if tc_existente:
        print(f"DolarCompras ya existe con valor={tc_existente.valor}")
        return

    valor_seed = None
    if valor is not None:
        valor_seed = _normalizar_valor(valor)
    else:
        tc_oficial = TipoCambio.query.filter_by(nombre='Oficial').first()
        if tc_oficial and tc_oficial.valor:
            valor_seed = _normalizar_valor(tc_oficial.valor)

    if valor_seed is None:
        raise ValueError("No se pudo inferir valor para DolarCompras. Pase --valor o configure Oficial.")

    nuevo = TipoCambio(nombre='DolarCompras', valor=valor_seed)
    db.session.add(nuevo)
    db.session.commit()
    print(f"DolarCompras creado con valor={valor_seed}")


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Seed idempotente para TipoCambio DolarCompras')
    parser.add_argument('--valor', type=str, default=None, help='Valor inicial de DolarCompras (opcional)')
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        seed_dolar_compras(args.valor)
