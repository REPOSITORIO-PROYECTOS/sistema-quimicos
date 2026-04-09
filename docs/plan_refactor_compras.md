# Plan Ejecutivo - DolarCompras Unico en Compras

## Objetivo
Implementar un tipo de cambio unico para compras llamado DolarCompras, aplicado automaticamente en operaciones en USD, con el campo TC no editable en la interfaz de usuario (UI) y garantizando la conservacion historica por orden.

## Alcance
1. Todo el modulo de compras.
2. Creacion, edicion, aprobacion, recepcion y pago de ordenes de compra.
3. Vistas de deuda asociadas a proveedores/compras.
4. Correccion historica de ordenes en USD con TC faltante o incorrecto (bugfix).

## Reglas de Negocio
1. Si la compra es en ARS: TC = 1.
2. Si la compra es en USD: TC = DolarCompras.
3. El TC de cada orden queda inmovilizado en `tc_transaccion` al crear o editar en la etapa de pre-aprobacion.
4. `tc_transaccion` es estrictamente inmutable despues de la aprobacion.
5. El campo TC en el frontend se muestra a modo informativo, pero esta bloqueado (solo lectura).

## Diseño Funcional
1. Fuente unica de TC para compras: DolarCompras.
2. Fallback temporal de despliegue: usar Oficial solo mientras se propaga la base de datos con DolarCompras.
3. Fallback definitivo en USD: no usar 1 de manera silenciosa ante un fallo; devolver un error de negocio si no hay un TC valido disponible.

## Implementacion por Fases

### Fase 1 - Datos y API
1. Dar de alta DolarCompras en la tabla/modelo de tipos de cambio.
2. Exponer lectura/actualizacion en los endpoints de tipos de cambio.
3. Agregar validacion a nivel base de datos/API para asegurar un valor mayor a 0.

### Fase 2 - Backend Compras
1. Resolver TC para USD usando DolarCompras en la creacion y edicion (pre-aprobacion).
2. Reforzar el bloqueo para evitar cambios en `tc_transaccion` durante y despues de la aprobacion.
3. Asegurar que los calculos de deuda y movimientos dependan exclusivamente del `tc_transaccion` historico de la base de datos.

### Fase 3 - Frontend Compras
1. Configurar el campo TC como `readonly` o `disabled` cuando la operacion sea en USD.
2. Implementar la autocarga del TC consumiendo el valor de DolarCompras.
3. Eliminar hardcodes de `tc_transaccion = 1` en los envios de los formularios.

### Fase 4 - Historico (Backfill)
1. Desarrollar y ejecutar un script de backfill para las OCs historicas en USD con `tc_transaccion` nulo o igual a 1.
2. Prioridad de recuperacion: buscar el dato en el snapshot historico (observaciones/notas).
3. Fallo de recuperacion: si no hay dato confiable, el script no inventa el TC; marca la orden y la exporta a un log para revision manual contable.

### Fase 5 - QA y Rollout
1. Probar escenarios end-to-end en ARS y USD.
2. Validar consistencia matematica de la deuda (backend vs frontend).
3. Ejecutar migraciones y script en staging, auditar la muestra y luego promover a produccion en una ventana controlada.

## Riesgos y Controles
1. Riesgo: subvaluacion de deuda por fallback silencioso a 1 en USD.
    Control: bloqueo duro de operaciones USD si no se obtiene un TC valido.
2. Riesgo: inconsistencia entre frontend y backend.
    Control: el backend siempre tiene la ultima palabra utilizando el `tc_transaccion` persistido.
3. Riesgo: impacto destructivo en datos historicos.
    Control: el script de backfill cuenta con modo dry-run, registro de auditoria e intervencion manual ante la duda.
4. Riesgo: el cambio global de TC afecta el pasado.
    Control: la actualizacion de DolarCompras solo afecta a las ordenes nuevas; el historico queda cristalizado por el campo `tc_transaccion`.

## Criterios de Aceptacion
1. Las compras nuevas en USD guardan `tc_transaccion = DolarCompras` de forma automatica.
2. El campo TC en la UI de compras USD no permite interacciones de edicion.
3. El sistema rechaza cualquier intento de modificar el `tc_transaccion` durante o despues de la aprobacion.
4. La deuda de proveedores y los movimientos de cuenta corriente reflejan la conversion historica exacta.
5. El script de backfill genera un reporte claro de registros actualizados y pendientes de revision manual.
6. No hay regresiones detectadas en el flujo tradicional de compras en ARS.

## Checklist de Salida a Produccion
- [ ] Migracion estructural y seed ejecutados en base de datos.
- [ ] Feature validada exhaustivamente en entorno staging con casos de uso reales.
- [ ] Script de backfill corrido en modo dry-run y verificado antes del commit real.
- [ ] Reporte de casos manuales entregado y revisado por el equipo contable.
- [ ] Plan de rollback tecnico y funcional documentado.
- [ ] Monitoreo activo programado (post-release 24-48h) enfocado en una muestra de las primeras OCs en USD.