# HLstudio · WhatsApp bot (Baileys + Express)
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# deps
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx tsc -p tsconfig.json

# runtime
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3001
ENV AUTH_DIR=/data/auth

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 botuser && \
    mkdir -p /data/auth && \
    chown -R botuser:nodejs /data

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder --chown=botuser:nodejs /app/dist ./dist
COPY --chown=botuser:nodejs package.json ./

USER botuser
EXPOSE 3001
VOLUME ["/data"]

CMD ["node", "dist/server.js"]
