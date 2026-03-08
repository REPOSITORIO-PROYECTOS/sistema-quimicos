# 🚀 Quimex - Aplicación de Gestión

Aplicación web full-stack para gestión de ventas, compras y pagos.

## 📁 Estructura del Proyecto

```
quimex/
├── docker-compose.yml          # Orquestación de servicios
├── build-optimized.sh          # Script para builds rápidos
│
├── backend/                    # API REST (Python/Flask)
│   ├── app/                    # Código fuente principal
│   ├── migrations/             # Migraciones de BD (Alembic)
│   ├── scripts/                # Scripts de utilidad
│   ├── Dockerfile              # Imagen Docker
│   ├── .dockerignore           # Archivos a excluir en build
│   └── requirements.txt        # Dependencias Python
│
├── frontend/                   # Aplicación web (Next.js/React)
│   ├── src/                    # Código fuente
│   ├── public/                 # Archivos estáticos
│   ├── Dockerfile              # Imagen Docker
│   ├── .dockerignore           # Archivos a excluir en build
│   ├── package.json            # Dependencias Node.js
│   ├── package-lock.json       # Lock file
│   └── next.config.ts          # Configuración Next.js
│
├── docs/                       # Documentación del proyecto
│   ├── INFRAESTRUCTURA_FINAL.md
│   ├── CONFIGURACION_SEGURA_NGINX.md
│   ├── OPTIMIZACIONES_BUILD.md
│   └── (más documentación)
│
├── tests/                      # Tests y validación
│   ├── test_code_structure.py
│   ├── test_compilation.py
│   └── (más tests)
│
└── README.md                   # Este archivo
```

## 🔧 Tech Stack

| Componente | Tecnología | Puerto |
|-----------|-----------|--------|
| **Frontend** | Next.js 15 + React 19 | 3000 (privado) |
| **Backend** | Python 3.11 + Flask | 5000 (privado) |
| **Base de Datos** | MySQL 8.0 | 3306 (privado) |
| **Cache** | Redis 7 | 6379 (privado) |
| **Reverse Proxy** | Nginx | 80/443 (público) |
| **SSL/TLS** | Let's Encrypt | - |

## 🚀 Inicio Rápido

### Requisitos
- Docker & Docker Compose
- Nginx
- Certificados SSL Let's Encrypt

### Iniciar servicios

```bash
# Build y arrancar
docker compose up -d --build

# O solo arrancar (si ya está buildado)
docker compose up -d

# Ver logs
docker compose logs -f

# Detener
docker compose down
```

### Acceso

- **Público:** `https://quimex.sistemataup.online`
- **API:** `https://quimex.sistemataup.online/api/*`
- **Local (desarrollo):** 
  - Frontend: `http://127.0.0.1:3000`
  - Backend: `http://127.0.0.1:5000`

## 📦 Build Optimizado

```bash
# Build rápido (con caché)
./build-optimized.sh

# Build limpio (sin caché)
./build-optimized.sh --no-cache

# Build y reinicia servicios
docker compose up -d --build
```

## 🔒 Seguridad

- ✅ Servicios internos **NO expuestos** (solo localhost)
- ✅ HTTPS obligatorio (TLS 1.2+)
- ✅ Reverse proxy Nginx como único punto de entrada público
- ✅ Security headers configurados
- ✅ Base de datos privada

## 📚 Documentación Detallada

Ver carpeta `docs/` para documentación completa:
- `INFRAESTRUCTURA_FINAL.md` - Diagrama y arquitectura
- `CONFIGURACION_SEGURA_NGINX.md` - Setup de Nginx
- `OPTIMIZACIONES_BUILD.md` - Mejoras de performance
- `MEJORAS_IMPLEMENTADAS.md` - Cambios realizados

## 🧪 Tests

Ejecutar tests:
```bash
cd tests/
python test_code_structure.py
python test_compilation.py
# etc...
```

## 📊 Información de Bases de Datos

- **Servidor:** `quimex-db` (nombre de contenedor) / `127.0.0.1:3306` (externo)
- **Base de datos:** `quimex_db`
- **Usuario:** `quimex`
- **Contraseña:** `QuimexApp_Pass123`

## 🛠️ Comandos Útiles

```bash
# Ver estado de servicios
docker compose ps

# Ver logs de un servicio
docker compose logs -f quimex-backend
docker compose logs -f quimex-frontend

# Ejecutar comando en contenedor
docker compose exec quimex-backend bash
docker compose exec quimex-db mysql -u quimex -p

# Reconstruir una imagen
docker compose build --no-cache quimex-frontend

# Limpiar (cuidado: elimina datos)
docker compose down -v
```

## 🌐 Nginx

```bash
# Verificar configuración
sudo nginx -t

# Recargar configuración
sudo systemctl reload nginx

# Ver estado
sudo systemctl status nginx

# Logs
sudo tail -f /var/log/nginx/quimex_access.log
sudo tail -f /var/log/nginx/quimex_error.log
```

## 🐛 Troubleshooting

### Backend no conecta a MySQL
```bash
docker compose logs quimex-backend | grep -i "connection\|error"
```

### Frontend no inicia
```bash
docker compose logs quimex-frontend | grep -i "error"
```

### Nginx no resuelve
```bash
sudo nginx -t
docker compose ps  # Verificar que backend/frontend estén running
```

## 📝 Variables de Entorno

Se configuran automáticamente en `docker-compose.yml`:
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `REDIS_URL`
- `FLASK_ENV`, `NODE_ENV`

## 🤝 Soporte

Para problemas o preguntas, revisar documentación en `docs/`

---

**Última actualización:** Marzo 3, 2026
