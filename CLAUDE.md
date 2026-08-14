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

## Validación de teléfono contra WhatsApp (ago-2026)

El formulario público aceptaba cualquier teléfono, así que los turnos falsos
entraban solos. Ahora, **para clientes nuevos**, se valida contra el directorio
de WhatsApp antes de escribir nada en la base.

- Endpoint `POST /exists` en el bot (`onWhatsApp`), cacheado con TTLs
  asimétricos: **24h los positivos, 15 min los negativos**. Un negativo mal
  resuelto se auto-corrige rápido. **No sacar el caché**: sin él una oleada se
  traduce 1:1 en consultas al directorio desde una cuenta no oficial, que es
  como te ganás un ban.
- **Solo clientes nuevos.** Al que ya reservó no se lo revalida; el caso "se
  equivocó tipeando" queda cubierto igual, porque un número mal tipeado no está
  en la base.
- **Falla abierto.** Bot caído, sin parear o timeout de 4s → la reserva pasa y
  queda `[security] chequeo_whatsapp_indeterminado`. Si eso aparece seguido, la
  validación está apagada de hecho. Convertir un hipo del bot en una caída del
  formulario sale más caro que dejar entrar un turno falso.
- **Al cliente no se le dice qué falló.** Los dos motivos (sin WhatsApp /
  formato inválido) colapsan en `reserva_rechazada` con mensaje genérico
  (`ERROR_RESERVA_RECHAZADA` en `server/actions/booking.ts`). Decirle cuál falló
  es explicarle qué evadir. Contrapartida asumida: el cliente legítimo que
  tipea mal tampoco recibe la pista, por eso el modal lo empuja a escribir por
  WhatsApp o pasar por el local.
- El detalle le llega al dueño por WhatsApp (`POST /notify-self`), con
  **throttle de 10 min** y conteo de suprimidos (`server/whatsapp/alertas.ts`).
  Sin el throttle, una oleada de 200 intentos serían 200 mensajes en su teléfono
  y el aviso se volvería el ataque.

### Lista negra y límites (Nivel 1, ago-2026)

`server/actions/anti-abuso.ts`. Todo aplica **solo al flow público**; el admin
puede seguir cargando turnos a mano para cualquiera.

- **`bloqueos_acceso`** — tabla por identificador (`ip` | `email` | `telefono`),
  no columnas en `clientes`: la IP es del intento, no del cliente, y el abusador
  genera un `cliente` nuevo por cada teléfono que inventa. Unique `(tipo, valor)`;
  re-bloquear reactiva la fila en vez de duplicar. `activo=false` al desbloquear
  para no perder el historial.
  - **La normalización tiene que ser idéntica al escribir y al leer**
    (`normalizarValorBloqueo`): teléfono en E.164, email e IP en minúsculas. Si
    divergen, el bloqueo no matchea nunca y falla en silencio — el peor modo de
    fallar, porque parece puesto y no hace nada.
- **Tope de 3 turnos activos** por cliente (`MAX_TURNOS_ACTIVOS`).
- **Un solo turno por franja** por cliente. El caso real fue una persona
  reservando el mismo horario con los dos barberos, 50 segundos de diferencia.
- **Rate limit 2/IP/hora** (bajado de 5). El caso que lo motivó hizo 2 reservas
  + 2 intentos rechazados en 71 segundos y pasó cómodo bajo el límite viejo.

Todos los rechazos devuelven el mismo `reserva_rechazada` genérico. Solo el de
lista negra dispara alerta al dueño (significa que el bloqueado volvió); los
topes no, porque suelen ser un cliente real pasándose y sería ruido.

**UI**: botón *Bloquear* en cada turno de la agenda — muestra teléfono, email e
IP con checkbox y ofrece cancelar el turno en el mismo paso (sin notificar al
cliente: avisarle al que abusa solo le dice que pruebe de otra forma).
Administración en `/admin/config/bloqueos-acceso`.

⚠️ **Cuidado con bloquear IPs compartidas** (wifi familiar, del local). La UI lo
advierte pero la decisión es del dueño.

### Forense: IP y navegador por turno

`turnos.creado_ip`, `creado_user_agent` y `origen` ('publico' | 'admin'). Sin
esto no se puede distinguir "muchas personas" de "una sola rotando IP con datos
móviles". `lib/request-info.ts` arma además una etiqueta corta del navegador y
marca `sospechoso` si el user-agent tiene firma de automatización (curl, python,
headless…). **El user-agent lo declara el cliente y se falsifica en una línea**:
sirve para agrupar, no como prueba.

`turnos.creado_ip` es dato personal (Ley 25.326): no exponerlo fuera del panel
admin ni mandarlo en notificaciones.

Líneas de log útiles (visibles en Coolify, sin abrir la base):

```
[turno] creado turnoId=… origen=publico tel=… ip=… navegador="Chrome 141 · Android"
[security] telefono_sin_whatsapp tel=… ip=… navegador="…" sospechoso=si
[security] alerta_dueño_enviada motivo=… suprimidos=N providerId=…
```

Ese `providerId` importa: al número del dueño le llegan también las
confirmaciones de barbero, así que sin él no se distingue cuál de los mensajes
salientes fue una alerta.

```sql
-- ¿Una persona o muchas? Agrupar por IP.
select creado_ip, count(*), count(distinct cliente_id)
from turnos where created_at > now() - interval '7 days' and origen = 'publico'
group by 1 order by 2 desc limit 20;
```

## Baileys: no actualizar, y NUNCA ponerle caret al pin

Estamos en `6.7.24` (jul-2026), pin **exacto** a propósito.

- Existe una **`6.17.16`** publicada en **marzo de 2025**: semver mayor, 17 meses
  más vieja. Probaron otro esquema de numeración y volvieron a 6.7.x. Con
  `^6.7.24` npm resuelve a `6.17.16` → downgrade silencioso que pierde todos los
  fixes de los incidentes de arriba. Es legítima (la publicó `purpshell`,
  maintainer), no es un ataque — pero el efecto es el mismo.
- El dist-tag `latest` apunta a **`7.0.0-rc14`**, un release candidate. No subir
  sin un motivo concreto. El 6.x sigue mantenido: `6.7.24` y `rc14` salieron el
  mismo día. El tag estable de esta rama es **`legacy`**.
- El warning `Cannot find package 'link-preview-js'` es **esperable y benigno**:
  es un peer dependency *opcional* de Baileys, salta solo en mensajes con URL
  (los `confirmacion_cliente`, que llevan el link de cancelación) y el mensaje
  sale igual, sin tarjeta de previsualización. No vale una dependencia.

### Redeploy del bot: stop → deploy, nunca deploy solo

Coolify tiene healthcheck y levanta el contenedor nuevo **antes** de bajar el
viejo. Como los dos usan las mismas credenciales, WhatsApp expulsa a uno con
`conflict/replaced (440)` y el bot entra en backoff de 60s. Se recupera solo,
pero durante ese minuto la validación está apagada — y tener dos instancias
peleándose por la misma sesión Signal es justo lo que dispara los incidentes de
descifrado documentados arriba.

```sh
ssh venturebyte "coolify stop <bot>"
ssh venturebyte "coolify deploy <bot>"
```

Ojo con los nombres: `coolify deploy hlstudio` es **ambiguo** (matchea la app y
el bot). Para la app usar el uuid `s84s00wgc0c0w4wocwg4kok4`; el bot responde a
`hlstudio-bot`.

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

### Incidente 3-ago-2026: "llegan mensajes del sábado ahora"

Síntoma: clientes recibiendo mensajes de días atrás, en loop. Causa: si no se le
pasa `msgRetryCounterCache`, Baileys se arma uno **por socket** con TTL de 1h.
Como el socket reciclaba cada ~50 min, el contador nunca llegaba a
`maxMsgRetryCount`; se reseteaba a 0 y en `retryCount === 1` Baileys llama a
`requestPlaceholderResend`, que le pide al teléfono **que reenvíe el mensaje**.
12 mensajes del sábado que el bot no pudo descifrar se re-pidieron cada 50 min
durante 3 días (635 retry receipts, 94,6% de la propia cuenta).

Tres cosas que quedaron en `bot.ts` y conviene no revertir sin entender:

- `msgRetryCounterCache` es **una sola instancia compartida entre sockets**
  (`TtlCache`, 24h). Si vuelve a crearse por socket, el loop vuelve.
- `shouldIgnoreJid` filtra **solo la cuenta propia** (teléfono + LID). Es el eco
  multi-dispositivo de los chats que el barbero maneja a mano: el bot no lo usa
  y no siempre puede descifrarlo. Baileys ackea y corta antes de descifrar, así
  la cola offline drena. No ampliarlo a terceros: los acuses de entrega
  (`handleReceipt`) usan el mismo predicado y son la única señal de si al
  cliente le llegó el mensaje.
- El caché de enviados (`getMessage`) se **persiste en disco** dentro del
  `AUTH_DIR`, como protobuf en base64. En memoria sola, cada redeploy dejaba
  trabados en "Esperando este mensaje" a los destinatarios pendientes.
  `JSON.stringify` del proto no sirve: convierte los Buffer en `{type:"Buffer"}`.
- El reset de sesión Signal es **reactivo, no por envío**. Corría en cada
  mensaje; mientras apuntaba al user equivocado (`session-<teléfono>.*` cuando
  el envío resuelve a un LID) era casi un no-op y no se notaba. Al corregir el
  target pasó a borrar la sesión en uso en cada envío, o sea negociar de cero
  siempre — más frágil que reusar una sesión que anda. Ahora el pedido de
  reenvío (`getMessage`) marca al contacto y recién el envío siguiente
  renegocia. **No volver a hacerlo incondicional.**

Medido en producción (4-ago-2026, dos envíos al mismo número): con sesión rancia
el mensaje entrega a 2 dispositivos y un tercero pide reenvío (lo cubre el
caché); tras la renegociación reactiva, 3 acuses de entrega y **cero** pedidos
de reenvío.

**Ojo con el diagnóstico**: que un `getMessage` dé `cacheHit:false` NO implica
que el bot haya fallado. WhatsApp le pide a cualquier dispositivo vinculado que
reponga mensajes de la cuenta, incluidos los que un humano mandó desde WhatsApp
Web/Desktop — el bot no los tiene y no puede tenerlos. Para saber si un ID es
nuestro, cruzarlo contra `notificaciones_enviadas.proveedor_id`, que es el
registro completo de lo que mandó el bot.

**Diagnóstico rápido** (los logs de Baileys ahora van a `warn`; subir con
`BAILEYS_LOG_LEVEL=info`, y `LIBSIGNAL_VERBOSE=1` para el dump de sesiones):

```sh
ssh venturebyte "docker logs <bot> 2>&1 | grep -c 'sent retry receipt'"   # storm
ssh venturebyte "docker logs <bot> 2>&1 | grep 'conexion cerrada'"        # ciclo de reconexión
ssh venturebyte "docker exec <bot> wget -qO- http://127.0.0.1:3001/health"
```

Ojo: `localhost` dentro del contenedor resuelve a IPv6 y el server escucha en
IPv4 — usar `127.0.0.1` o el health da "connection refused" y parece caído.

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
