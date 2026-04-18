FROM node:22-alpine

WORKDIR /app

# API URL se bake en tiempo de build (Next.js NEXT_PUBLIC_* son compile-time)
ARG NEXT_PUBLIC_API_URL=https://quimex.sistemataup.online/api
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
  CMD node -e "const req=require('http').get('http://127.0.0.1:3000', (r)=>{r.resume();r.on('end',()=>process.exit(r.statusCode===200?0:1));});req.on('error',()=>process.exit(1));req.setTimeout(9000,()=>{req.destroy();process.exit(1);});"

# Ejecutar en producción
CMD ["npm", "run", "start"]
