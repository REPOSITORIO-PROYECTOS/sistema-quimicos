# Configuración Segura de Quimex - Nginx Reverse Proxy

## ✅ Cambios Realizados

### 1. **Puertos Internos (No Expuestos al Público)**
Todos los servicios ahora están vinculados SOLO a `127.0.0.1` (localhost):

```yaml
# MySQL Database
ports:
  - "127.0.0.1:3306:3306"  # Solo accessible desde localhost

# Redis Cache  
ports:
  - "127.0.0.1:6379:6379"  # Solo accessible desde localhost

# Python Backend
ports:
  - "127.0.0.1:5000:5000"  # Solo accessible desde localhost

# Next.js Frontend
ports:
  - "127.0.0.1:3000:3000"  # Solo accessible desde localhost
```

### 2. **Nginx Reverse Proxy (Único Punto de Entrada Público)**

Archivo: `/home/dev_taup/nginx/sites-available/quimex.sistemataup.online`

**Configuración:**
- ✅ Escucha en puerto 443 (HTTPS) con SSL/TLS
- ✅ Redirect automático de HTTP (80) a HTTPS (443)
- ✅ Certificado SSL de Let's Encrypt
- ✅ Headers de seguridad (HSTS, X-Frame-Options, etc.)
- ✅ Enrutamiento inteligente:
  - `/api/*` → Backend (Python Flask) en `127.0.0.1:5000`
  - `/` → Frontend (Next.js) en `127.0.0.1:3000`
  - `/health` → Health check del backend

### 3. **Acceso Público**

```
https://quimex.sistemataup.online/          → Frontend (Next.js)
https://quimex.sistemataup.online/api/*     → Backend API (Flask)
```

**Acceso Interno (Solo localhost):**
```
http://127.0.0.1:3000/    → Frontend directo
http://127.0.0.1:5000/    → Backend directo
localhost:3306            → MySQL (dev)
localhost:6379            → Redis (dev)
```

## 🔒 Ventajas de Seguridad

1. **Servicios Privados:** Base de datos, Redis y aplicaciones NO expuestas al internet
2. **HTTPS Obligatorio:** Todo tráfico encriptado (TLS 1.2+)
3. **Single Entry Point:** Solo nginx accesible públicamente
4. **Security Headers:** Prevención de XSS, Clickjacking, etc.
5. **Proxying Seguro:** Headers X-Real-IP, X-Forwarded-For, etc.

## 📋 Arquitectura Final

```
Internet (147.93.68.229)
         ↓
    Nginx (443)
    ↙           ↘
Backend API     Frontend
(127.0.0.1:5000) (127.0.0.1:3000)
   ↓                
MySQL, Redis
(127.0.0.1 only)
```

## ✨ Estado

- ✅ Docker Compose actualizado con puertos privados
- ✅ Nginx configurado como reverse proxy
- ✅ SSL/TLS habilitado  
- ✅ Nginx reloaded y tests OK

## 🚀 Inicio de Servicios

```bash
cd /home/dev_taup/quimex
docker compose -f docker-compose-mysql.yml up -d
```

**Verificar:**
```bash
docker compose -f docker-compose-mysql.yml ps
# Los puertos mostrarán 127.0.0.1:XXXX (privados)
```

## 📊 Puertos Públicos Abiertos

**Antes:** 3000, 5000, 3306, 6379 (Inseguro)  
**Ahora:** Solo 80 (HTTP→HTTPS) y 443 (HTTPS) a través de Nginx (Seguro ✅)
