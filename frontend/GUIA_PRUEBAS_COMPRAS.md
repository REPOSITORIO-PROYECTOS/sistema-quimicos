# 📋 Guía de Pruebas - Módulo de Compras

## ✅ Checklist de Pruebas Manuales

### 1️⃣ Prueba como Usuario ADMIN

**Resultado Esperado:**
- ✅ Debes ver el título: **"Gestión de Compras (Admin)"**
- ✅ Debes ver botón: **"Pedido Rápido (Admin)"** (con fondo AMARILLO/destacado)
- ✅ Debes ver botón: **"Pendientes de Aprobación"**
- ✅ Debes ver botón: **"Recepciones Pendientes"**
- ✅ Debes ver botón: **"Resumen Deuda Proveedores"**
- ✅ Debes ver botón: **"Historial Compras"**
- ❌ **NO DEBES VER** botón: **"Solicitar Compra"**

**Pasos:**
1. Inicia sesión como usuario con rol **ADMIN**
2. Ve a `/compras`
3. Verifica que todos los botones esperados se muestren
4. Verifica que "Solicitar Compra" NO se muestre

**Funcionalidad:**
- [ ] Clic en "Pedido Rápido (Admin)" → Navega a `/pedido-rapido`
- [ ] Clic en "Pendientes de Aprobación" → Navega a `/ver-lista-pedidos?estado=Solicitado`
- [ ] Clic en "Recepciones Pendientes" → Navega a `/recepciones-pendientes`
- [ ] Clic en "Resumen Deuda Proveedores" → Navega a `/deuda-proveedores`
- [ ] Clic en "Historial Compras" → Navega a `/historial-compras`

---

### 2️⃣ Prueba como Usuario NO ADMIN (ej: ALMACEN)

**Resultado Esperado:**
- ✅ Debes ver el título: **"Acciones Posibles Compras"**
- ✅ Debes ver botón: **"Solicitar Compra"**
- ✅ Debes ver botón: **"Recepciones Pendientes"**
- ❌ **NO DEBES VER** botón: **"Pedido Rápido (Admin)"**
- ❌ **NO DEBES VER** botón: **"Pendientes de Aprobación"**
- ❌ **NO DEBES VER** botón: **"Resumen Deuda Proveedores"** (oculto para ALMACEN)

**Pasos:**
1. Inicia sesión como usuario con rol **ALMACEN** u otro rol NO ADMIN
2. Ve a `/compras`
3. Verifica que los botones esperados se muestren
4. Verifica que "Pedido Rápido" y "Pendientes de Aprobación" NO aparezcan

**Funcionalidad:**
- [ ] Clic en "Solicitar Compra" → Navega a `/registrar-pedido-compra`
- [ ] Clic en "Recepciones Pendientes" → Navega a `/recepciones-pendientes`

---

## 🧪 Pruebas Automatizadas

### Ejecutar Tests con npm:

```bash
cd /home/dev_taup/proyectos/quimex/frontend

# Ejecutar solo tests del módulo compras
npm test -- src/app/compras/__tests__/page.test.tsx

# Ejecutar todos los tests (modo watch)
npm test

# Ejecutar tests sin modo watch
npm test -- --no-coverage --passWithNoTests
```

### Casos de Prueba Incluidos:

#### Para ADMIN:
- ✅ Debe mostrar "Pedido Rápido (Admin)"
- ✅ Debe mostrar "Pendientes de Aprobación"
- ❌ NO debe mostrar "Solicitar Compra"
- ✅ Debe mostrar "Recepciones Pendientes"
- ✅ Debe mostrar "Resumen Deuda Proveedores"
- ✅ Título debe ser "Gestión de Compras (Admin)"

#### Para NO ADMIN:
- ✅ Debe mostrar "Solicitar Compra"
- ❌ NO debe mostrar "Pedido Rápido (Admin)"
- ❌ NO debe mostrar "Pendientes de Aprobación"
- ✅ Debe mostrar "Recepciones Pendientes"
- ✅ Título debe ser "Acciones Posibles Compras"

#### Navegación:
- ✅ "Pedido Rápido (Admin)" navega a `/pedido-rapido`
- ✅ "Pendientes de Aprobación" navega a `/ver-lista-pedidos?estado=Solicitado`
- ✅ "Recepciones Pendientes" navega a `/recepciones-pendientes`

---

## 🎨 Cambios Visuales Implementados

### Antes:
- Todos los botones con mismo estilo (blanco)
- "Pedido Rápido" no era destacado

### Después:
- ✨ **"Pedido Rápido (Admin)"** con fondo **AMARILLO** (bg-yellow-400)
- 📍 Separador visual entre "Pedido Rápido" y otras opciones
- 🎯 Título dinámico según rol
- 📐 Mejor jerarquía visual

---

## 📝 Checklist Final de Validación

- [ ] ✅ Usuario ADMIN ve "Pedido Rápido" destacado en amarillo
- [ ] ❌ Usuario ADMIN NO ve "Solicitar Compra"
- [ ] ✅ Usuario ADMIN ve "Pendientes de Aprobación"
- [ ] ✅ Usuario NO ADMIN ve "Solicitar Compra"
- [ ] ❌ Usuario NO ADMIN NO ve "Pedido Rápido"
- [ ] ✅ Todos los botones navegan a la ruta correcta
- [ ] ✅ Tests automatizados pasan sin errores
- [ ] ✅ Título cambia según el rol

---

## 🚀 Estatus

**Estado:** ✅ LISTO PARA PROBAR

Los cambios han sido implementados y están listos para validación manual y automatizada.
