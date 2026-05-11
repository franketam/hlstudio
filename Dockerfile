# --- HLstudio · Next.js 15 standalone build ---
# Pensado para Coolify (o cualquier runtime tipo Docker / Fly / Railway).

FROM node:22-alpine AS base
# tzdata es CRÍTICO: sin esto, date-fns-tz falla silenciosamente a UTC al
# resolver "America/Argentina/Buenos_Aires" → horas mostradas en pages como
# /turno/[token] aparecen +3h respecto a la zona local.
RUN apk add --no-cache libc6-compat tzdata
WORKDIR /app

# --- deps layer ---
FROM base AS deps
COPY package.json package-lock.json* ./
# Forzamos NODE_ENV=development e --include=dev para asegurar que devDeps
# (typescript, eslint, tailwind, tsx, drizzle-kit) se instalen incluso si
# Coolify inyecta NODE_ENV=production como ENV antes de este step.
ENV NODE_ENV=development
RUN npm ci --include=dev --no-audit --no-fund

# --- build layer ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Las env vars reales se inyectan en runtime por Coolify; en build-time
# necesitamos algunas placeholders para que `next build` no explote.
ENV DATABASE_URL=postgresql://placeholder:placeholder@placeholder:5432/placeholder
ENV ADMIN_EMAIL=placeholder@example.com
ENV ADMIN_PASSWORD_HASH=placeholder_build_time_only_replace_in_runtime
ENV SESSION_PASSWORD=placeholder_placeholder_placeholder_xxx
ENV CANCEL_TOKEN_SECRET=placeholder_placeholder_placeholder_xxx
RUN npm run build

# Bundle scripts CLI (migrate / seed) a .mjs autosuficientes que se ejecutan
# en runtime con `node` puro — sin tsx, sin tsconfig, sin path aliases.
# esbuild viene como dep transitiva de tsx (devDep), así que ya está en node_modules.
RUN node_modules/.bin/esbuild db/migrate.ts db/seed.ts \
    --bundle --platform=node --format=esm --target=node22 \
    --outdir=dist/scripts --out-extension:.js=.mjs \
    --tsconfig=tsconfig.json

# --- runtime layer ---
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# TZ del proceso Node — refuerza la TZ que usa date-fns-tz vía Intl.
ENV TZ=America/Argentina/Buenos_Aires

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/db ./db
COPY --from=builder --chown=nextjs:nodejs /app/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/dist/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
