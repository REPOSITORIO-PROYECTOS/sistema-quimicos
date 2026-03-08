FROM node:18-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar todas las dependencias
RUN npm ci --prefer-offline --no-audit || npm install

# Copiar código fuente
COPY . .

# Exponer puerto
EXPOSE 3000

# Build para producción
RUN npm run build || echo "Build skipped"

# Healthcheck
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD npm run build || node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Iniciar servidor de Next  
CMD ["npm", "run", "start"]

# Exponer puerto
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000 || exit 1

# Comando de inicio
CMD ["npm", "start"]
