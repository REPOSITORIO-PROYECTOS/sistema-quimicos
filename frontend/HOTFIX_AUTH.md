# Hotfix - Problemas de Autenticación en Producción

## Problema Observado

En los logs de la consola del navegador se vio:
1. ✅ Login exitoso
2. ❌ `GET /api/auth/me 404 (Not Found)`
3. ❌ `AuthProvider: Token inválido al inicializar`
4. ❌ `Error al obtener productos: Error: No autenticado`

## Causa Raíz

La aplicación intentaba validar el token contra `/api/auth/me`, pero ese endpoint no existe en el backend de Quimex, causando dos problemas:

### Problema 1: Validación Stricta del Token
El `auth-provider.tsx` limpiaba el token si la validación fallaba (404). Esto era muy restrictivo dado que el endpoint podría no existir.

**Solución**: Hacer la validación más granular:
- **200**: Token válido ✅
- **404**: Endpoint no existe, mantener token equally
- **401/403**: Token realmente inválido, limpiar ✅
- **500/Connection Error**: Mantener token, loguear warning

### Problema 2: Race Condition en Hidratación
Los contextos de datos (ProductsContext, ClientesContext, etc.) se inicializaban ANTES de que AuthProvider completara la hidratación, causando que hicieran fetch sin token.

**Solución**: Crear `AuthGuard` que espera a `isHydrated` antes de renderizar los sconteidos de datos.

## Cambios Realizados

### 1. `auth-provider.tsx` - Validación Más Tolerante
```typescript
// Antes: limpiaba token si checkResponse.ok era false
if (checkResponse.ok) { ... } else { localStorage.removeItem("authToken"); }

// Ahora: maneja cada status code apropiadamente
if (checkResponse.ok) { setUser(...); }
else if (checkResponse.status === 404) { setUser(...); } // Mantener
else if (checkResponse.status === 401 || 403) { removeAuth(); } // Limpiar
else { setUser(...); } // Mantener otros
```

### 2. `auth-guard.tsx` - NUEVO
Componente que espera a que AuthProvider esté hidratado antes de renderizar children:
```typescript
export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { isHydrated } = useAuth();
  if (!isHydrated) return <Spinner />;
  return <>{children}</>;
};
```

### 3. `layout.tsx` - Nuevo Orden de Providers
Antes:
```tsx
<AuthProvider>
  <ClientesProvider>
    <ProductsProvider>
      <AppShell>{children}</AppShell>
    </ProductsProvider>
  </ClientesProvider>
</AuthProvider>
```

Ahora:
```tsx
<AuthProvider>
  <AuthGuard>  {/* ← Espera hidratación */}
    <ClientesProvider>
      <ProductsProvider>
        <AppShell>{children}</AppShell>
      </ProductsProvider>
    </ClientesProvider>
  </AuthGuard>
</AuthProvider>
```

## Flujo Después del Fix

```
1. Usuario hace login
   ├─ Frontend POST a /api/auth/login
   ├─ Backend retorna {token, user_info}
   └─ Se guarda en localStorage

2. Usuario refrescar página (F5)
   ├─ AuthProvider inicia hidratación
   ├─ Lee user + token de localStorage
   ├─ Intenta validar token contra /api/auth/me
   │  └─ Si 404: mantiene token (endpoint no existe)
   │  └─ Si 401/403: limpia token (inválido)
   │  └─ Si error conexión: mantiene token
   ├─ AuthGuard ve isHydrated=true
   └─ Renderiza contextos de datos con token valido

3. Contextos hacen fetch
   ├─ apiFetch obtiene token de localStorage
   ├─ Incluye Authorization header
   └─ Peticiones funcionan ✅
```

## Testing

Para validar que funciona:

1. **Login y refrescar (F5)**
   - Login correctamente
   - Refrescar página
   - Verificar que sesión se mantiene
   - Verificar que no hay errores "No autenticado"

2. **Monitorear console.log**
   - No debe haber "Token inválido"
   - Si ve 404 en /api/auth/me, debe loguear "Endpoint no existe, mantiendo sesión"

3. **Verificar datos cargan**
   - Productos, clientes, proveedores deben cargar sin errores
   - Header y navbar deben mostrarse

## Archivos Modificados

- `src/components/providers/auth-provider.tsx` (modificado)
- `src/components/providers/auth-guard.tsx` (NUEVO)
- `src/app/layout.tsx` (modificado)

## Notas

- La validación de token ahora es más tolerante
- Race conditions en hidratación están prevenidas
- Si realmente necesitas validar tokens, implementar un endpoint `/api/auth/me` en el backend
- Los logs ahora son más descriptivos para debugging futuro
