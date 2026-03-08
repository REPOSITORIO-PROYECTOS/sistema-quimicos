# Tests E2E - Quimex

## Descripción

Tests end-to-end usando Playwright para validar el flujo completo de autenticación:
- ✅ Login exitoso
- ✅ Persistencia de sesión al refrescar
- ✅ Carga correcta de datos
- ✅ Logout limpia sesión
- ✅ Redireccionamiento por rol
- ✅ Mantenimiento de datos entre navegación
- ✅ Manejo de errores

## Instalación

```bash
npm install @playwright/test
npx playwright install  # Descargar navegadores
```

## Comandos

### Correr todos los tests
```bash
npm run test:e2e
```

### Modo watch (recarga automática)
```bash
npm run test:e2e:watch
```

### UI interactivo
```bash
npm run test:e2e:ui
```

### Debug mode
```bash
npm run test:e2e:debug
```

### Correr un test específico
```bash
npx playwright test auth.spec.ts
```

### Correr un test específico con patrón
```bash
npx playwright test -g "mantener sesión"
```

### Ver reporte HTML
```bash
npx playwright show-report
```

## Configuración

### Variables de entorno
```bash
# URL de la aplicación (default: http://localhost:3000)
PLAYWRIGHT_URL=http://localhost:3000
```

### Seleccionar navegador
```bash
# Solo Chromium
npx playwright test --project=chromium

# Solo Firefox
npx playwright test --project=firefox

# Solo Safari
npx playwright test --project=webkit
```

## Estructura del Test

```
e2e/
└── auth.spec.ts
    ├── Login exitoso
    ├── Persistencia de sesión
    ├── Mostrar header/navbar cuando autenticado
    ├── Logout limpia sesión
    ├── Redireccionamiento por rol
    ├── Mantener datos entre navegación
    └── Manejo de errores de login
```

## Qué se valida

### 1. Login Exitoso
- Llenar formulario con credenciales
- Hacer click en botón de login
- Verificar redirección desde /login
- Verificar que token se guarda en localStorage
- Verificar que usuario se guarda en localStorage

### 2. Persistencia de Sesión
- Simular usuario loggeado con localStorage
- Ir a página principal
- Refrescar la página
- Verificar que sesión se mantiene
- Verificar que datos están intactos

### 3. Header/Navbar Visible
- Verificar que Header está visible cuando autenticado
- Verificar que Navbar está visible
- Verificar que nombre de usuario se muestra

### 4. Logout
- Hacer click en botón de logout
- Verificar redirección a /login
- Verificar que localStorage está limpio

### 5. Redireccionamiento por Rol
- User con rol ALMACEN → /compras
- User con rol VENTAS_LOCAL → /acciones-puerta
- User con rol CONTABLE → /movimientos
- User con rol VENTAS_PEDIDOS → /dashboard-pedidos
- User con rol ADMIN → / (dashboard)

### 6. Mantener Datos
- Navegar entre diferentes rutas
- Verificar que datos persisten en localStorage

### 7. Errores de Login
- Credenciales inválidas
- Verificar que no se guarda token
- Verificar mensaje de error

## Screenshot y Videos

Los fallos generan automáticamente:
- `test-results/` - Screenshots de fallos
- Videos de las pruebas fallidas

## Troubleshooting

### El servidor dev no inicia
```bash
# Asegúrate que el puerto 3000 esté libre
lsof -i :3000
```

### Tests se cuelgan
```bash
# Aumentar timeout
npx playwright test --timeout 60000
```

### Fallos en credenciales
Los tests usan credenciales mock. Si necesitas validar contra un servidor real, edita:

```typescript
// En e2e/auth.spec.ts
const TEST_USER = {
  usuario: "tu-usuario-real",
  password: "tu-contraseña-real",
};
```

## Integración CI/CD

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

## Notas

- Los tests incluyen mocks para localStorage
- Los tests simulan la API sin hacer requests reales
- Se pueden adaptar los tests para usar un servidor de testing real
- Playwright maneja automáticamente la espera de elementos
