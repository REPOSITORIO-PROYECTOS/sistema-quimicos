from decimal import Decimal, InvalidOperation
import json

from app import create_app, db
from app.models import OrdenCompra, TipoCambio


MARKER = '__TC_SNAPSHOT__:'


def extract_tc_snapshot(texto):
    raw = str(texto or '')
    if MARKER not in raw:
        return None
    for line in raw.split('\n'):
        if line.startswith(MARKER):
            payload_raw = line[len(MARKER):].strip()
            try:
                payload = json.loads(payload_raw)
                value = payload.get('tc_usado')
                if value is None:
                    return None
                tc = Decimal(str(value))
                if tc > 0:
                    return tc.quantize(Decimal('0.01'))
            except (json.JSONDecodeError, InvalidOperation, TypeError, ValueError):
                return None
    return None


def get_tc_oficial_fallback():
    tc = TipoCambio.query.filter_by(nombre='Oficial').first()
    if tc and tc.valor:
        try:
            value = Decimal(str(tc.valor))
            if value > 0:
                return value.quantize(Decimal('0.01'))
        except (InvalidOperation, TypeError, ValueError):
            return None
    return None


def run_backfill(dry_run=True, limit=None):
    q = OrdenCompra.query.order_by(OrdenCompra.id.asc())
    if limit:
        q = q.limit(limit)

    total = 0
    updated = 0
    by_snapshot = 0
    by_fallback = 0
    unchanged = 0

    tc_fallback = get_tc_oficial_fallback() or Decimal('1.00')

    for oc in q.all():
        total += 1

        ajuste_tc = bool(oc.ajuste_tc)
        nuevo_tc = Decimal('1.00')

        if ajuste_tc:
            snapshot_tc = extract_tc_snapshot(oc.observaciones_solicitud) or extract_tc_snapshot(oc.notas_recepcion)
            if snapshot_tc is not None:
                nuevo_tc = snapshot_tc
                by_snapshot += 1
            else:
                nuevo_tc = tc_fallback
                by_fallback += 1

        actual_tc = Decimal(str(oc.tc_transaccion or Decimal('1.00'))).quantize(Decimal('0.01'))
        if actual_tc == nuevo_tc:
            unchanged += 1
            continue

        oc.tc_transaccion = nuevo_tc
        updated += 1

    if dry_run:
        db.session.rollback()
    else:
        db.session.commit()

    print(f'total={total}')
    print(f'updated={updated}')
    print(f'unchanged={unchanged}')
    print(f'from_snapshot={by_snapshot}')
    print(f'from_fallback={by_fallback}')
    print(f'fallback_tc_oficial={tc_fallback}')
    print(f'dry_run={dry_run}')


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Backfill de tc_transaccion en ordenes_compra')
    parser.add_argument('--apply', action='store_true', help='Aplicar cambios. Si no se pasa, corre en dry-run.')
    parser.add_argument('--limit', type=int, default=None, help='Limita cantidad de OCs a procesar')
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        run_backfill(dry_run=not args.apply, limit=args.limit)
