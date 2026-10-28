FROM node:22

WORKDIR /app

# Copia dependências e instala
COPY package*.json ./
# Retentativas para quedas de rede durante o download (ECONNRESET)
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm ci --no-audit --no-fund

# Copia o código
COPY . .

# Gera o Prisma e faz o build do NestJS
RUN npx prisma generate
RUN npm run build

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3002/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# A aplicação depende do banco para sessão e agenda; falhas devem interromper o deploy.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
