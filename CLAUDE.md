# HLstudio — Notas para Claude / agentes

> Este archivo lo lee `fullstack-dev` al arrancar. Mantenelo conciso.
> Brief funcional completo: `brief-cliente.md`.

## Decisiones críticas (Sprint 0)

1. **DB = Postgres puro autohosteado + Drizzle ORM.**
   - Nada de Supabase. La base la administra Coolify (managed Postgres allá) y `db/schema.ts` es la fuente de verdad.
   - Migraciones en `./drizzle/` versionadas. Generar con `npm run db:generate`, aplicar con `npm run db:migrate`.

2. **Auth = plana, hardcodeada por env vars (MVP).**
   - **No hay tabla `User`**. Hay UN admin único: `ADMIN_EMAIL` + `ADMIN_PASSWORD` (plaintext).
   - Comparación en server con `timingSafeEqual` (sin timing-attack).
   - Sesión via `iron-session` con cookie firmada (`SESSION_PASSWORD`).
   - El hashing scrypt se sacó: el formato `scrypt$x$y` chocaba con la interpolación `$` de @next/env y rompía el login. Para 1 admin con env var privada no aporta seguridad real.
   - Para v2 multi-admin/multi-barbero → tabla `usuarios` + `role` + hashing real (argon2id). No sobre-diseñar ahora.

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
ADMIN_PASSWORD=tu-password  # plaintext, MVP — comparación con timingSafeEqual server-side
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
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` — plaintext, MVP (un solo admin)
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

## Verificación de dominio Resend (CHECKLIST PRE-LANZAMIENTO)

Dominio comprado: `hlstudio.com.ar`. From oficial: `reservas@hlstudio.com.ar`.

Mientras no esté verificado, mantener `RESEND_FROM_EMAIL=onboarding@resend.dev` en `.env.local` y Coolify. Sin verificación los emails se bloquean o van a spam para cualquier destinatario distinto del owner de la cuenta Resend.

```
[ ] 1. Ir a Resend dashboard → Domains → Add → hlstudio.com.ar
[ ] 2. Copiar los 3 DNS records (SPF, DKIM, return-path) y cargarlos en el proveedor del dominio.
[ ] 3. Esperar verificación (puede tardar minutos a horas).
[ ] 4. Cambiar RESEND_FROM_EMAIL=reservas@hlstudio.com.ar en Coolify env vars.
[ ] 5. Redeploy.
[ ] 6. Probar envío real desde un turno de prueba.
[ ] 7. Verificar que NO llega a spam (mandate uno a vos mismo, gmail/outlook).
```

## Hardening de seguridad

- **Rate limiting** in-memory por IP en endpoints públicos (`lib/rate-limit.ts`):
  - `reservar` (create turno): 5 / IP / hora.
  - `login` (admin): 10 / IP / 15 min.
  - `cancelar` (turno): 20 / IP / hora.
  - Los límites viven como constantes en `RATE_LIMITS` en `lib/rate-limit.ts`.
- **Security headers** en `next.config.ts`: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (cámara/mic/geo denegados), HSTS 1 año. CSP queda pendiente para Sprint 3 (requiere auditar inline scripts/styles de Next).
- **Cancel token**: HMAC-SHA256 con `CANCEL_TOKEN_SECRET`, verificación con `timingSafeEqual` (`lib/cancel-token.ts`).
- **Logs de seguridad** con prefijo `[security]` (rate limit hits, login failures, cancel token inválido). Visibles en Coolify logs para auditar.

## Anti-doble-booking

Decisión: validación a nivel server (transacción + check) en Sprint 1.
Más adelante, si hace falta blindar, agregar constraint `EXCLUDE USING gist` con extensión `btree_gist` via migración SQL custom (no la expone Drizzle nativamente).

## Identificación de cliente

Por teléfono normalizado a E.164 (`+54911...`). Hay índice unique en `clientes.telefono`.
Riesgo conocido: familias compartiendo número → un único registro de cliente. Validar con el cliente final cuando aparezca el caso (TODO §13.9 del brief).

## WhatsApp (Sprint 1.5)

Servicio aparte en `services/whatsapp-bot/` — Express + Baileys. La app principal se comunica vía HTTP usando `WHATSAPP_BOT_URL` + `WHATSAPP_BOT_TOKEN`.

**Reglas de canal** (ver `server/notif/dispatch.ts`):
- Si el destinatario tiene teléfono normalizable Y `WHATSAPP_BOT_URL` está seteada → WhatsApp.
- Si no → email.
- Si WA falla (cualquier motivo), NO se cae a email automáticamente. Queda registrado en `notificaciones_enviadas.error` con el detalle.

**Backward-compat**: barberos sin `telefono` cargado siguen recibiendo email — no se rompe el flujo viejo.

**Idempotencia**: unique compuesto en `(turno_id, tipo, canal)` — un mismo turno puede llevar registro de `recordatorio_24h` por whatsapp y por email (distintos canales, distintas filas), pero nunca dos por el mismo canal.

**Pareo inicial**:
1. Levantar bot (Coolify: app separada apuntando a `services/whatsapp-bot/Dockerfile`; local: `docker compose --profile wa up -d whatsapp-bot`).
2. Loguearse al panel admin → `/admin/whatsapp` → escanear QR con celular.
3. Estado pasa a `ready`. Listo.

**Auto-clean en logout**: si WhatsApp expulsa la sesión remotamente (DisconnectReason.loggedOut), el bot borra el `AUTH_DIR` y muestra QR nuevo. El admin re-parea desde `/admin/whatsapp`.

**TODO confirmar dirección exacta** del local con el cliente y reemplazar el placeholder `"HLstudio — Chivilcoy"` en:
- `server/whatsapp/templates.ts` (constante `HL_DIRECCION_PLACEHOLDER`)
- Idealmente también en los emails (`server/email/templates/*`).

**Deploy Coolify**:
1. Crear servicio Postgres (ya existe).
2. Crear app principal HLstudio desde Dockerfile raíz (ya existe).
3. **Crear app NUEVA** desde `services/whatsapp-bot/Dockerfile`:
   - Port: 3001.
   - Healthcheck: `/health`.
   - Volume persistente montado en `/data` (para el AUTH_DIR — sin eso, cada redeploy pide re-pareo).
   - Env vars: `WHATSAPP_BOT_TOKEN` (igual que en la app principal), opcional `LOG_LEVEL=info`.
4. En la app principal HLstudio, agregar env vars: `WHATSAPP_BOT_URL=http://hlstudio-whatsapp-bot:3001` (DNS interno de Coolify) y `WHATSAPP_BOT_TOKEN=<mismo bearer>`.
5. Redeploy app principal.
6. Loguearse → `/admin/whatsapp` → escanear QR.

**Smoke pendiente al pairing inicial en prod**: el envío real WA solo se puede validar contra una cuenta WhatsApp real pareada. En dev se chequea typecheck + build + arranque del bot (sin pareo no envía).

## Recordatorios T-3h (cron en Coolify)

Script CLI: `scripts/recordatorios.ts` → bundleado a `scripts/recordatorios.mjs` por el Dockerfile (junto a migrate/seed).

> **T-24h desactivado (pedido cliente, jul-2026).** El bot ya NO manda el
> recordatorio del día anterior; solo el corto (~T-3h). La maquinaria del T-24h
> (template, ventana, tipo `recordatorio_24h`) sigue en el código: para
> reactivarlo, volver a incluir `"24h"` en `tipos` dentro de `main()` en
> `scripts/recordatorios.ts`. `--tipo=24h` quedó como NO-OP (loguea aviso y sale 0).
>
> El recordatorio corto era T-2h hasta jul-2026; se movió a T-3h (pedido del cliente).
> La migración `0005` renombró las filas `recordatorio_2h` → `recordatorio_3h`, y
> `--tipo=2h` se acepta como alias legado de `--tipo=3h`.

**Cómo lo invoca el cron:**
```sh
node scripts/recordatorios.mjs              # corre solo T-3h
node scripts/recordatorios.mjs --tipo=3h    # solo 3h
node scripts/recordatorios.mjs --tipo=24h   # NO-OP: T-24h desactivado, no envía
node scripts/recordatorios.mjs --dry-run    # detecta candidatos pero no envía
```

**Idempotencia**: cada par `(turno_id, tipo)` tiene unique constraint en `notificaciones_enviadas`. El claim atómico (`INSERT ... ON CONFLICT DO NOTHING`) garantiza que dos runs en paralelo no envían dos veces.

**Ventana de barrido**: 3h busca turnos confirmados entre `now+1h` y `now+3h`. El turno entra a la ventana por el borde superior, así que el envío sale a ~T-3h en el primer tick del cron que lo agarra; el margen inferior es tolerancia a caídas del scheduler. **El cron DEBE correr cada ~10 min** — si corre menos seguido, el recordatorio llega tarde (p. ej. cron horario → llega entre 2h y 3h antes en vez de 3h).

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
