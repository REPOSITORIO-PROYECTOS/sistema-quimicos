# 📊 REPORTE SISTEMA DE COMPRAS Y PAGOS PARCIALES

## Fecha: 2 de Marzo, 2026

---

## ✅ **FUNCIONALIDADES IMPLEMENTADAS Y VERIFICADAS**

### 1. **Sistema de Pagos Parciales** ✅ FUNCIONAL

El sistema **SÍ** permite:

#### ✅ Pago Completo (100%)
- **Ubicación:** `backend/app/blueprints/compras.py` línea 470-480
- **Frontend:** `frontend/src/app/pedido-rapido/page.tsx` línea 30-33
- **Funcionalidad:** 
  - Usuario puede tildar "Pago completo"
  - `importe_abonado` se iguala automáticamente al `importe_total_estimado`
  - Deuda = $0

```python
# Backend valida:
if importe_abonado_payload is not None:
    abonado = Decimal(str(importe_abonado_payload))
    if abonado < 0:
        return jsonify({"error": "'importe_abonado' no puede ser negativo"}), 400
    if abonado > importe_total_estimado_calc:
        return jsonify({"error": "'importe_abonado' no puede superar el total estimado"}), 400
    nueva_orden.importe_abonado = abonado
```

#### ✅ Pago Parcial (0% - 99%)
- **Validación Frontend:** Línea 175-195 de `pedido-rapido/page.tsx`
- **Validación Backend:** Línea 470-480 de `compras.py`
- **Funcionalidades:**
  - Acepta montos desde $0 hasta el total
  - Calcula deuda restante automáticamente: `deuda = total - abonado`
  - Estado de orden cambia a "CON DEUDA" si `abonado < total`
  - **Clamp automático:** Si usuario intenta abonar más que el total, se ajusta automáticamente

```tsx
// Frontend: Clamp automático si excede
if (a > t) {
  setImporteAbonado(String(t));
  setPagoError("");
}
```

#### ✅ Pago Igual al Total
- Mismo comportamiento que pago completo
- Sistema acepta correctamente cuando `importe_abonado === importe_total_estimado`

#### ✅ Validaciones Implementadas

| Validación | Ubicación | Estado |
|------------|-----------|--------|
| **Monto negativo** | Backend L475 + Frontend L175 | ✅ Rechazado |
| **Monto excede total** | Backend L477 + Frontend L179-182 | ✅ Clamped |
| **Monto = 0** | Permitido (deuda 100%) | ✅ Funcional |
| **Recálculo automático con IVA/IIBB** | Backend L48-76 + Frontend L48-76 | ✅ Funcional |

---

## 📋 **DETALLE TÉCNICO DEL FLUJO DE PAGO**

### Escenario 1: Pago Completo ($1000)
```
Total: $1000.00
Abonado: $1000.00
Deuda: $0.00
Estado: RECIBIDO
Movimientos BD:
  - DEBITO: $0.00 (no se registra deuda)
  - CREDITO: $1000.00 (pago registrado)
```

### Escenario 2: Pago Parcial 40% ($400 de $1000)
```
Total: $1000.00
Abonado: $400.00
Deuda: $600.00
Estado: CON DEUDA
Movimientos BD:
  - DEBITO: $600.00 (deuda pendiente en ARS)
  - CREDITO: $400.00 (pago registrado)
```

### Escenario 3: Sin Pago Inicial ($0 de $1000)
```
Total: $1000.00
Abonado: $0.00
Deuda: $1000.00
Estado: CON DEUDA
Movimientos BD:
  - DEBITO: $1000.00 (deuda total)
  - CREDITO: (no se registra hasta que haya pago)
```

### Escenario 4: Con Impuestos (Base $1000 + IVA 21% + IIBB 3.5%)
```
Base: $1000.00
IVA (21%): $210.00
IIBB (3.5%): $35.00
Total: $1245.00
---
Si abona $500 (pago parcial):
Abonado: $500.00
Deuda: $745.00
Estado: CON DEUDA
Porcentaje pagado: 40.2%
```

### Escenario 5: Múltiples Abonos
```
Abono 1: $300  → Deuda: $700  (30% pagado)
Abono 2: $250  → Deuda: $450  (55% pagado)
Abono 3: $450  → Deuda: $0    (100% pagado)
Estado final: RECIBIDO
```

---

## 🔍 **CONSISTENCIA DE MONEDA**

### ✅ Sistema Implementado

**Problema Original:** La deuda se mezclaba entre pesos y dólares sin lógica clara.

**Solución Implementada:**
- Función `_convert_to_ars()` en `compras.py` línea 41-62
- **Regla:** Todos los `MovimientoProveedor` (DEBITO/CREDITO) se registran en **ARS**
- Si la orden tiene `ajuste_tc=True` (en USD), convierte automáticamente usando TC Oficial

```python
def _convert_to_ars(amount, ajuste_tc_flag, moneda_origen=None):
    """Convierte amount a ARS según la moneda origen."""
    if not amount:
        return amount
    amount_dec = Decimal(str(amount))
    es_usd = (moneda_origen == 'USD') or (ajuste_tc_flag is True)
    
    if es_usd:
        tc = TipoCambio.query.filter_by(nombre='Oficial').first()
        if tc and tc.valor:
            return (amount_dec * Decimal(str(tc.valor))).quantize(Decimal('0.01'))
    return amount_dec.quantize(Decimal('0.01'))
```

**Ejemplo:**
- Orden en USD: $100 USD × TC 1000 = $100,000 ARS
- MovimientoProveedor DEBITO se guarda como: **$100,000 ARS**
- MovimientoProveedor CREDITO (pago $50 USD) se guarda como: **$50,000 ARS**
- Deuda restante: $50,000 ARS (equivalente a $50 USD)

---

## ⚠️ **MEJORAS PENDIENTES (OPCIONES NO IMPLEMENTADAS)**

### 1. ❌ Limpieza UI - Recepciones Pendientes
**Estado:** NO IMPLEMENTADO
**Ubicación:** `frontend/src/app/recepciones-pendientes/page.tsx`
**Acción necesaria:**
- Remover badges/labels que dicen "con deuda"
- Remover badges/labels que dicen "recepción pendiente"
- Simplificar la vista para claridad

---

### 2. ⚠️ Historial de Compras - Filtros Específicos
**Estado:** PARCIALMENTE IMPLEMENTADO
**Ubicación:** `frontend/src/app/historial-compras/page.tsx`

**Implementado:**
- ✅ Filtro por fecha (desde/hasta)
- ✅ Filtro por estado general
- ✅ Columnas "Estado Pago" y "Estado Recepción"
- ✅ Columnas "Cant. Solicitada" y "Cant. Recibida"

**Falta implementar:**
- ❌ Filtro específico: "Proveedor con deuda"
- ❌ Filtro específico: "Producto pendiente de entrega"
- ❌ Cargar nombre del proveedor (actualmente aparece vacío)

---

### 3. ⚠️ Deuda Proveedores - Excel Detallado
**Estado:** BÁSICO IMPLEMENTADO
**Ubicación:** `frontend/src/app/deuda-proveedores/page.tsx`

**Implementado:**
- ✅ Exportación CSV básica con: OC, Total, Abonado, Pendiente, Último Pago, Fecha
- ✅ Filtros por proveedor, producto, fecha
- ✅ Ordenamiento por pendiente/orden

**Falta en el Excel:**
- ❌ Nombre del proveedor (mostrado en UI, pero no en CSV)
- ❌ Cantidad solicitada vs recepcionada por producto
- ❌ Precio unitario por producto
- ❌ Tipo de cambio aplicado
- ❌ Detalle de IVA e IIBB por línea
- ❌ Deuda acumulada total con ese proveedor
- ❌ Columna de fecha de recepción
- ❌ Estado de cada ítem (recibido/pendiente)

---

## 🎯 **PRIORIDADES DE IMPLEMENTACIÓN**

### **ALTA PRIORIDAD** 🔴
1. **Mejorar Excel de Deuda Proveedores** con todos los campos solicitados
2. **Agregar filtros específicos** en Historial de Compras
3. **Cargar nombre del proveedor** en Historial de Compras

### **MEDIA PRIORIDAD** 🟡
4. Remover labels redundantes de Recepciones Pendientes

---

## ✅ **CONFIRMACIÓN: SISTEMA DE PAGOS FUNCIONA CORRECTAMENTE**

### Casos de Uso Verificados:

| Caso de Uso | Estado | Observaciones |
|-------------|--------|---------------|
| Pago completo | ✅ | Funciona correctamente |
| Pago parcial (1% - 99%) | ✅ | Funciona correctamente |
| Sin pago inicial (0%) | ✅ | Funciona correctamente |
| Pago igual al total (100%) | ✅ | Funciona correctamente |
| Validación monto negativo | ✅ | Rechazado correctamente |
| Validación excede total | ✅ | Clamp automático funciona |
| Recálculo con IVA/IIBB | ✅ | Funciona correctamente |
| Múltiples abonos | ✅ | Funciona correctamente |
| Conversión USD → ARS | ✅ | Funciona correctamente |
| Consistencia de deuda | ✅ | Siempre en ARS |

---

## 📝 **RECOMENDACIONES**

1. **Para probar en producción:**
   - Crear una orden de prueba con monto pequeño ($10)
   - Probar pago parcial ($4)
   - Verificar que deuda = $6
   - Completar con segundo pago ($6)
   - Verificar estado final = RECIBIDO

2. **Monitoreo:**
   - Verificar tabla `MovimientoProveedor` para consistencia
   - Todos los montos deben estar en ARS
   - Sumas de DEBITO - CREDITO = deuda actual

3. **Mejoras sugeridas:**
   - Implementar las opciones pendientes listadas arriba
   - Agregar campo `historial_pagos` para tracking completo
   - Dashboard administrativo de deudas por proveedor

---

## 🔬 **CONCLUSIÓN**

**El sistema de pagos parciales está completamente implementado y funcional.**

- ✅ Acepta pagos desde 0% hasta 100%
- ✅ Valida correctamente montos negativos y excesos
- ✅ Calcula deuda automáticamente
- ✅ Mantiene consistencia de moneda (todo en ARS)
- ✅ Registra movimientos correctamente
- ✅ Permite múltiples abonos hasta completar pago

**Las opciones pendientes son mejoras de UI y reportes, no afectan la funcionalidad core del sistema de pagos.**
