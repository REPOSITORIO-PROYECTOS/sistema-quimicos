# Analisis del modulo de compras

## Diagnostico ejecutivo
El modulo de compras esta bastante trabajado y ya tiene piezas maduras: estados de orden, calculo de deuda, recepciones parciales, pagos parciales, conversion a ARS y auditoria. No es un modulo vacio ni improvisado.

Tambien tiene riesgos claros que conviene no ignorar: fuente de verdad distribuida entre cabecera, items y movimientos; varios calculos de importe; uso de snapshots en texto libre; y comparaciones de estados que pueden romperse si la normalizacion no es estricta.

## Lo que esta bien resuelto
- Existe una entidad central clara: `OrdenCompra`.
- Hay relacion entre orden, detalles e historial de movimientos.
- La logica de pagos y recepcion se separa en helpers.
- Hay auditoria con `AuditLog`.
- Hay tests especificos para partes del calculo de compras.

## Fuente de verdad
- Orden: `OrdenCompra`.
- Detalle de cantidades y precios: `DetalleOrdenCompra`.
- Deuda y creditos: `MovimientoProveedor`.
- Tipo de cambio: primero snapshot en texto de la orden, luego `TipoCambio`.

## Estados y transiciones
Estados observados en el codigo:
- `SOLICITADO`
- `APROBADO`
- `RECHAZADO`
- `RECIBIDO`
- `CON DEUDA`
- `RECIBIDA_PARCIAL`
- `EN_ESPERA_RECEPCION`

Transiciones relevantes:
- Crear orden -> `SOLICITADO` o `APROBADO` segun rol.
- Aprobar orden -> `APROBADO`.
- Rechazar orden -> `RECHAZADO`.
- Registrar pago -> recalcula estado segun recepcion y saldo.
- Recibir mercaderia -> ajusta recepcion, deuda y estado.

## Hallazgos tecnicos importantes
1. El estado se normaliza a mayusculas en algunos sitios, pero el modelo aun arranca con `Solicitado`. Eso obliga a ser muy estricto con comparaciones y filtros.
2. El calculo de total objetivo usa multiples fuentes y toma el mayor. Eso evita falsos negativos, pero tambien puede ocultar inconsistencias de datos.
3. La recepcion parcial puede dejar desalineado el importe si la linea recibida no se recalcula de forma proporcional.
4. El balance de proveedor depende de movimientos que no tienen una restriccion unica fuerte en la base.
5. Parte de la trazabilidad tecnica viaja embebida en texto libre, lo que funciona pero no es una fuente de verdad ideal.

## Riesgos principales
- Doble fuente de verdad entre cabecera e items.
- Desincronizacion entre deuda calculada y movimientos contables.
- Estados inconsistentes si entra texto con distinta capitalizacion.
- Riesgo de error silencioso si falla la resolucion del tipo de cambio.
- Riesgo de que la recepcion parcial sobreestime importes pendientes.

## Pruebas existentes
- `tests/test_compras_iva_iibb.py` valida parseo y recalculo base.
- `tests/test_compras_recepciones_parciales.py` cubre recepcion y conversion a ARS.
- `tests/test_compras_pagos_parciales.py` apunta a pagos completos y parciales.

## Limitacion de verificacion en este entorno
- No se pudo ejecutar `pytest` porque no esta instalado en el entorno actual.
- El analisis de arriba esta basado en lectura del codigo y de los tests, no en una corrida completa.

## Conclusiones
El modulo de compras esta funcional y con bastante trabajo serio encima, pero no lo consideraria cerrado ni perfectamente robusto. La parte mas sensible sigue siendo la coherencia entre orden, recepcion, deuda y movimientos. Si se toca este modulo, el cambio debe ser quirurgico y validado con casos de pago parcial, recepcion parcial y orden en USD.

## Archivos clave
- `backend/app/blueprints/compras.py`
- `backend/app/models.py`
- `backend/app/blueprints/proveedores.py`
- `backend/app/blueprints/finanzas.py`
- `backend/app/blueprints/dashboard.py`
- `tests/test_compras_iva_iibb.py`
- `tests/test_compras_recepciones_parciales.py`
- `tests/test_compras_pagos_parciales.py`
