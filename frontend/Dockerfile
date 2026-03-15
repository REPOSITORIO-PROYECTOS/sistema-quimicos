FROM node:20-alpine

WORKDIR /app

# API URL se bake en tiempo de build (Next.js NEXT_PUBLIC_* son compile-time)
ARG NEXT_PUBLIC_API_URL=https://quimex.sistemataup.online
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar todas las dependencias
RUN npm ci --prefer-offline --no-audit || npm install

# Copiar código fuente
COPY . .

# Build para producción
RUN npm run build

# Exponer puerto
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Ejecutar en producción
CMD ["npm", "run", "start"]
