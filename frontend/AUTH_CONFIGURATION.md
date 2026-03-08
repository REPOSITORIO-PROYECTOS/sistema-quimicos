# Guía de Autenticación Quimex - Configuración Final

## Estado Actual

- **APIs configurada**: `https://quimex.sistemataup.online` (Bachill)
- **Autenticación**: JWT con token en localStorage
- **Contexto**: `AuthProvider` en `/src/components/providers/auth-provider.tsx`
- **Roles disponibles**: ADMIN, ALMACEN, VENTAS_LOCAL, VENTAS_PEDIDOS, CONTABLE

## Problemas Resueltos

### 1. Conflicto de Contextos
- ✅ Consolidado `auth-provider.tsx` como único provider
- ✅ Análisis realizado en `AuthContext.tsx` (eliminar si no se usa)
- ✅ Todos los imports actualizados para usar `@/components/providers/auth-provider`

### 2. Problemas de Hidratación
- ✅ Agregada bandera `isHydrated` para saber cuándo el cliente cargó desde localStorage
- ✅ AppShell espera a `isHydrated` antes de mostrar contenido
- ✅ Evitar "Text content does not match" warnings

### 3. Validación de Tokens
- ✅ Al cargar desde localStorage, se valida el token contra `/api/auth/me`
- ✅ Si el token es inválido, se limpia automáticamente
- ✅ Manejo robusto de errores

### 4. Sincronización entre Tabs
- ✅ Event listener para `storage` events
- ✅ Cambios en otro tab se propagan automáticamente

## Arquitectura de Autenticación

```
┌─ layout.tsx
│  └─ AuthProvider
│     │  useEffect
│     │  ├─ Lee localStorage.user & localStorage.authToken
│     │  ├─ Valida token contra /api/auth/me
│     │  ├─ Establece isHydrated = true
│     │  └─ Renderiza children
│     │
│     └─ AppShell
│        ├─ Espera a isHydrated
│        ├─ Si !user → LoginForm
│        └─ Si user → Header + Navbar + children
│
└─ Componentes
   └─ useAuth() para acceder a {user, login, logout, getToken}
```

## Flujo de Login

```
1. Usuario entra a /login
2. LoginForm.tsx llama a login(usuario, contraseña)
3. auth-provider.tsx hace POST a {API_BASE_URL}/api/auth/login
4. Backend retorna {token, user_info}
5. Se valida que tenga rol válido
6. Se guarda en localStorage
7. Se actualiza contexto → AppShell se re-renderiza
8. Usuario ve Header + Navbar
```

## Flujo de Hidratación (SSR Recovery)

```
Servidor (SSR)
└─ layout.tsx (sin "use client")
   └─ AuthProvider renderiza con user=null
   └─ AppShell muestra "Inicializando..."
   └─ HTML se envía al cliente

Cliente (Hydration)
└─ React monta componentes
└─ AuthProvider.useEffect[] se ejecuta
   ├─ Lee localStorage.user & localStorage.authToken
   ├─ Valida token
   ├─ Establece isHydrated=true
   └─ setUser(user) → triggers re-render
└─ AppShell ve isHydrated=true, user=X
└─ Renderiza Header + Navbar + children
```

## Variables de Entorno Necesarias

```bash
# .env.local
NEXT_PUBLIC_API_URL=https://quimex.sistemataup.online
```

## Tests

Ejecutar tests de autenticación:
```bash
npm run test  # o npm run test:watch para desarrollo
```

Tests incluyen:
- ✅ Login exitoso
- ✅ Login fallido
- ✅ Logout
- ✅ Hidratación desde localStorage
- ✅ Validación de estructura de usuario
- ✅ Sincronización entre tabs

## Puntos de Extensión

### Agregar nuevo rol
```typescript
// En auth-provider.tsx
export const ROLES_DISPONIBLES_VALUES = [
  "ADMIN", "ALMACEN", "VENTAS_LOCAL", "VENTAS_PEDIDOS", "CONTABLE",
  "NUEVO_ROL"  // <-- AGREGAR AQUÍ
] as const;
```

### Agregar rutas públicas adicionales
```typescript
// En AppShell.tsx
const PUBLIC_ROUTES = ['/login', '/register', '/nueva-ruta-publica'];
```

### Cambiar API Base URL
```typescript
// En auth-provider.tsx, línea ~57
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "nueva-url-aqui";
```

## Checklist de Validación

- [ ] Login funciona correctamente
- [ ] Logout limpia localStorage y redirige a /login
- [ ] Refrescar página mantiene sesión (hidratación)
- [ ] Abrir nueva tab mantiene sesión (compartir cookies)
- [ ] Token inválido muestra LoginForm
- [ ] Cada rol ve su respectiva página por defecto
- [ ] Tests pasan sin errores
- [ ] No hay warnings de hidratación en consola

## Comandos Útiles

```bash
# Desarrollo
npm run dev

# Tests
npm run test
npm run test:watch

# Build
npm run build
npm start
```

## Archivos Modificados

1. `src/components/providers/auth-provider.tsx` - Provider mejorado
2. `src/components/AppShell.tsx` - Mejor manejo de hidratación
3. `src/app/page.tsx` - Simplificado, usa contexto
4. `src/components/providers/__tests__/auth-provider.test.tsx` - Tests agregados

## Próximos Pasos

1. Validar que todos los componentes que usan `useAuth()` fueron actualizados
2. Revisar que no haya referencias a `AuthContext.tsx` antiguo
3. Ejecutar todos los tests
4. Hacer deploy y monitorear logs de autenticación
