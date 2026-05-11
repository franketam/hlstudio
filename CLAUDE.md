# HLstudio — Notas para Claude / agentes

> Este archivo lo lee `fullstack-dev` al arrancar. Mantenelo conciso.
> Brief funcional completo: `brief-cliente.md`.

## Decisiones críticas (Sprint 0)

1. **DB = Postgres puro autohosteado + Drizzle ORM.**
   - Nada de Supabase. La base la administra Coolify (managed Postgres allá) y `db/schema.ts` es la fuente de verdad.
   - Migraciones en `./drizzle/` versionadas. Generar con `npm run db:generate`, aplicar con `npm run db:migrate`.

2. **Auth = plana, hardcodeada por env vars (MVP).**
   - **No hay tabla `User`**. Hay UN admin único cuyas credenciales viven en `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (scrypt).
   - Sesión via `iron-session` con cookie firmada (`SESSION_PASSWORD`).
   - Para v2 multi-admin/multi-barbero migramos a tabla `usuarios` + `role`. No sobre-diseñar ahora.
   - Generar hash de password: `npx tsx scripts/hash-password.ts "password"`.

3. **Email = Resend.** Dominio comprado: **hlstudio.com.ar**.
   - **From oficial**: `reservas@hlstudio.com.ar` (ya decidido).
   - **TODO pendiente**: verificar dominio en Resend (alta de DNS records SPF/DKIM/return-path) ANTES de usar en producción. Mientras no esté verificado, mantener `RESEND_FROM_EMAIL=onboarding@resend.dev` en `.env.local` y Coolify.
   - Sin verificación, los emails se bloquean / van a spam para cualquier destinatario distinto del owner de Resend.
   - Pasos: Resend dashboard → Domains → Add → cargar DNS records en el proveedor del dominio → esperar verificación → cambiar `RESEND_FROM_EMAIL` en producción.

## Stack

- Next.js 15 (App Router) + React 19 + TS estricto
- Tailwind 3.4 + shadcn-style components manuales (`components/ui/*`)
- Drizzle ORM + `postgres` driver
- iron-session para auth
- Resend para email transaccional
- date-fns + date-fns-tz (default tz: `America/Argentina/Buenos_Aires`)
- Build: `output: "standalone"` para Docker

## Cómo levantar local

```powershell
# 1. Instalar deps
npm install

# 2. Copiar env y completar
Copy-Item .env.example .env.local
npx tsx scripts/hash-password.ts "una-password-segura"  # pegar el output en ADMIN_PASSWORD_HASH
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # SESSION_PASSWORD
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # CANCEL_TOKEN_SECRET

# 3. Levantar postgres local (puerto 5433 host, 5432 container)
docker compose up -d postgres

# 4. Aplicar migraciones
npm run db:migrate

# 5. Dev server
npm run dev
```

## Cómo deployar a Coolify

1. **Crear servicio Postgres 16** en Coolify. Anotar el connection string (interno, no el público).
2. **Crear app desde el repo** (Build Pack: Dockerfile). Coolify usa el `Dockerfile` raíz.
3. **Cargar env vars en Coolify** (todas las de `.env.example` excepto las `dev_*` placeholder):
   - `DATABASE_URL` — del Postgres del paso 1
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` — generar con `scripts/hash-password.ts`
   - `SESSION_PASSWORD`, `CANCEL_TOKEN_SECRET` — `openssl rand -hex 32` o equivalente, 32+ chars cada uno
   - `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
   - `NEXT_PUBLIC_APP_URL` — la URL pública de la app
   - `TIMEZONE=America/Argentina/Buenos_Aires`
4. **Healthcheck path**: `/api/health` (devuelve 200 + JSON).
5. **Migraciones / seed en producción**: en el shell de Coolify (`/app`) correr:
   ```sh
   node scripts/migrate.mjs   # aplica /drizzle/*.sql
   node scripts/seed.mjs      # idempotente — barberos, servicios, precios, horarios
   ```
   Esos `.mjs` se generan en build-time con esbuild (bundle autosuficiente, sin tsx ni tsconfig).
   No usar `npm run db:migrate` en runtime: requiere tsx (devDep) que no está en la imagen final.

## Convenciones

- **Server Components por default.** `"use client"` solo donde hay interactividad real.
- **Validación con Zod** en cada server action y route handler.
- **Errores tipados**: server actions devuelven `{ ok: true, data } | { ok: false, error: { code, message } }`. Ver `app/admin/actions.ts`.
- **No hardcodear strings de UI**: van en `lib/constants.ts` (`COPY`).
- **Timestamps en BD**: siempre `timestamp { withTimezone: true }`. Conversión a TZ del local solo en presentación.
- **Estructura de carpetas**:
  - `app/` — rutas Next
  - `app/admin/(authed)/` — todo lo que requiere sesión, gateado por `(authed)/layout.tsx`
  - `db/` — schema Drizzle + cliente
  - `lib/` — env, session, password, utils, constants
  - `components/ui/` — primitivos shadcn-style
  - `components/brand/` — logo, avatar, etc.
  - `drizzle/` — migraciones SQL (generadas, NO editar a mano)

## Anti-doble-booking

Decisión: validación a nivel server (transacción + check) en Sprint 1.
Más adelante, si hace falta blindar, agregar constraint `EXCLUDE USING gist` con extensión `btree_gist` via migración SQL custom (no la expone Drizzle nativamente).

## Identificación de cliente

Por teléfono normalizado a E.164 (`+54911...`). Hay índice unique en `clientes.telefono`.
Riesgo conocido: familias compartiendo número → un único registro de cliente. Validar con el cliente final cuando aparezca el caso (TODO §13.9 del brief).

## Recordatorios T-24h / T-2h (cron en Coolify)

Script CLI: `scripts/recordatorios.ts` → bundleado a `scripts/recordatorios.mjs` por el Dockerfile (junto a migrate/seed).

**Cómo lo invoca el cron:**
```sh
node scripts/recordatorios.mjs              # corre 24h y 2h
node scripts/recordatorios.mjs --tipo=24h   # solo 24h
node scripts/recordatorios.mjs --tipo=2h    # solo 2h
node scripts/recordatorios.mjs --dry-run    # detecta candidatos pero no envía
```

**Idempotencia**: cada par `(turno_id, tipo)` tiene unique constraint en `notificaciones_enviadas`. El claim atómico (`INSERT ... ON CONFLICT DO NOTHING`) garantiza que dos runs en paralelo no envían dos veces.

**Ventana de barrido**: 24h busca turnos confirmados entre `now+23h` y `now+25h`; 2h entre `now+1h` y `now+3h`. Asumimos cron cada ~10 min — la ventana absorbe atrasos del scheduler.

**Configurar el cron en Coolify**: dos opciones, la más simple es Scheduled Tasks (Coolify ≥ v4).
- Dashboard → la app HLstudio → Scheduled Tasks → Add.
- Command: `node scripts/recordatorios.mjs`
- Frecuencia: `*/10 * * * *` (cada 10 min). Para producción real, `*/5` da más margen.

Alternativa si no se usa Scheduled Tasks: container sidecar `node:22-alpine` con `crond` y un crontab montado, apuntando al mismo binario via `docker exec`.

**Logs**: JSON-line a stdout (y stderr para warn/error). Coolify los captura automáticamente. Buscar mensajes:
- `msg: "enviado"` → email mandado OK
- `msg: "skip: cliente sin email"` → turno sin email del cliente (no se puede recordar)
- `msg: "envio fallo permanente (no reintenta)"` → Resend rechazó el email (mal formado, etc.) — queda registrado en `notificaciones_enviadas.error`
- `msg: "envio fallo transitorio"` → se reintenta en el próximo barrido (el lock se libera)

**Exit codes**: `0` OK, `1` errores transitorios (cron retomará), `2` fatal (DB/env caído).
