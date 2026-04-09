# Contexto del proyecto Quimex

## Resumen
Quimex es una aplicacion de gestion comercial con backend en Flask y SQLAlchemy, una base de datos relacional y un frontend separado. El backend organiza la logica por dominios mediante blueprints.

## Capas principales
- Backend: `backend/app/`
- Frontend: `frontend/`
- Base de datos: modelos ORM en `backend/app/models.py`
- Pruebas: `tests/`

## Modulos mas relevantes
- Ventas y pedidos: `backend/app/blueprints/ventas.py`
- Dashboard: `backend/app/blueprints/dashboard.py`
- Compras: `backend/app/blueprints/compras.py`
- Proveedores: `backend/app/blueprints/proveedores.py`
- Finanzas: `backend/app/blueprints/finanzas.py`
- Reportes: `backend/app/blueprints/reportes.py`

## Fuente de verdad tecnica
- Los registros de negocio viven en la base de datos y se modelan con SQLAlchemy.
- Para compras, la entidad principal es `OrdenCompra`.
- Los movimientos contables de proveedor se reflejan en `MovimientoProveedor`.
- Los items viven en `DetalleOrdenCompra`.

## Reglas operativas que conviene respetar
- No asumir `proveedor_id` fijo al crear una orden.
- Validar datos maestros antes de persistir una compra.
- Mantener trazabilidad de quien creo, aprobo, recibio y pago.
- Evitar que el frontend sea la unica barrera de validacion.

## Archivos clave para entender el sistema
- `backend/app/models.py`
- `backend/app/blueprints/compras.py`
- `backend/app/blueprints/dashboard.py`
- `backend/app/__init__.py`
- `tests/test_compras_iva_iibb.py`
- `tests/test_compras_recepciones_parciales.py`
- `tests/test_compras_pagos_parciales.py`

## Puntos de validacion rapida
- Ver que el blueprint de compras este registrado en `backend/app/__init__.py`.
- Ver que el flujo de compras use estados consistentes.
- Ver que el calculo de deuda y recepcion no dependa solo de textos editables.
- Ver que exista auditabilidad en acciones criticas.

## Observacion de ejecucion
- En este entorno no se pudo correr `pytest` porque no esta instalado.
- Antes de afirmar cobertura real conviene ejecutar las pruebas con el entorno Python completo.
