# Galactic Wars — imagem única que builda server + client e sobe o processo do jogo.
FROM node:20-slim

# Prisma precisa de openssl no Debian slim.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifests primeiro (cache de layers do npm).
COPY package*.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

# Código-fonte.
COPY . .

# Prisma client + build do server (tsc) e do client (vite).
RUN npx prisma generate --schema=server/prisma/schema.prisma
RUN npm run build

ENV NODE_ENV=production
# Render/Railway injetam $PORT em runtime; 3001 é só o default local.
ENV PORT=3001
EXPOSE 3001

# Aplica migrations, garante o estado inicial e sobe o servidor (que serve o client).
CMD ["sh","-lc","npx prisma migrate deploy --schema=server/prisma/schema.prisma && node server/dist/seed.js && node server/dist/index.js"]
