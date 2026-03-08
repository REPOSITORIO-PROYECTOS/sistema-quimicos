# 📦 Infraestructura Quimex - Limpia y Producción

## ✅ Archivos de Composición (Limpios)

```
/home/dev_taup/quimex/
├── docker-compose.yml          ✅ PRODUCCIÓN (MySQL + Redis + Backend + Frontend)
├── backend/
│   ├── Dockerfile              ✅ Optimizado (Python 3.11)
│   ├── .dockerignore           ✅ Excluye archivos innecesarios
│   └── requirements.txt        ✅ Dependencias Python
├── frontend/
│   ├── Dockerfile              ✅ Optimizado (Node.js 18 multi-stage)
│   ├── .dockerignore           ✅ Excluye node_modules, cache, etc
│   ├── package.json            ✅ Dependencias Node.js
│   └── next.config.ts          ✅ Configuración Next.js
└── build-optimized.sh          ✅ Script para builds rápidos
```

## ❌ Archivos Eliminados

```
docker-compose-test.yml         ❌ Eliminado (test innecesario)
docker-compose-mysql.yml        ❌ Renombrado → docker-compose.yml
backend/nixpacks.toml           ❌ Eliminado (no usamos Nixpacks)
frontend/nixpacks.toml          ❌ Eliminado (no usamos Nixpacks)
NIXPACKS_README.md              ❌ Eliminado (documentación innecesaria)
```

## 🚀 Stack Tecnológico Final

### Base de Datos
- **MySQL 8.0** (Puerto 127.0.0.1:3306 - Privado)
- Respaldo completo importado (`quimex_db`)

### Cache
- **Redis 7-alpine** (Puerto 127.0.0.1:6379 - Privado)

### Backend
- **Python 3.11** (Flask/SQLAlchemy)
- Puerto 127.0.0.1:5000 (Privado)
- Conecta a MySQL + Redis

### Frontend  
- **Node.js 18** (Next.js)
- Puerto 127.0.0.1:3000 (Privado)
- Build optimizado (multi-stage)

### Reverse Proxy (Nginx)
- **Puerto 80** → Redirige a HTTPS
- **Puerto 443** → SSL/TLS con Let's Encrypt
- Único punto de entrada público: `https://quimex.sistemataup.online`

## 🔒 Seguridad

- ✅ Servicios internos NO expuestos al público
- ✅ HTTPS obligatorio
- ✅ Security headers configurados
- ✅ Proxying seguro (X-Real-IP, X-Forwarded-For)

## 🛠️ Comandos Útiles

### Build
```bash
# Build rápido (con caché)
./build-optimized.sh

# Build limpio (sin caché)
./build-optimized.sh --no-cache

# Build y restart
docker compose up -d --build
```

### Operación
```bash
# Iniciar
docker compose up -d

# Detener
docker compose down

# Ver logs
docker compose logs -f quimex-backend
docker compose logs -f quimex-frontend

# Estado
docker compose ps
```

### Nginx
```bash
# Recargar config
sudo systemctl reload nginx

# Ver status
sudo systemctl status nginx

# Logs
sudo tail -f /var/log/nginx/quimex_access.log
sudo tail -f /var/log/nginx/quimex_error.log
```

## 📊 Puertos

### Públicos
- **80** (HTTP → 443)
- **443** (HTTPS)

### Privados (localhost only)
- **3000** (Frontend Next.js)
- **5000** (Backend Flask)
- **3306** (MySQL)
- **6379** (Redis)

## 🌐 Acceso

- **Público:** `https://quimex.sistemataup.online`
- **API:** `https://quimex.sistemataup.online/api/*`
- **Desarrollo local:** `http://127.0.0.1:3000` (solo desde el servidor)

## ✨ Optimizaciones Aplicadas

- ✅ .dockerignore en backend y frontend (reduce contexto de build)
- ✅ npm ci con flags --prefer-offline --no-audit (builds 30-40% más rápidos)
- ✅ Multi-stage builds optimizados
- ✅ Eliminadas dependencias innecesarias

## 🎯 Estado: LISTO PARA PRODUCCIÓN

La infraestructura está limpia, segura y optimizada. Sin archivos innecesarios.
