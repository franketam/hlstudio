# HLstudio

Sistema de reservas de turnos para **HLstudio**, barbería de gama alta en Chivilcoy, Buenos Aires.
2 barberos, agendas independientes, reserva guest mobile-first, panel admin con agenda y ficha de cliente.

> Brief funcional completo: [`brief-cliente.md`](./brief-cliente.md).
> Notas técnicas para agentes IA: [`CLAUDE.md`](./CLAUDE.md).

---

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript estricto**
- **Tailwind 3.4** + componentes shadcn-style (manuales)
- **Postgres 16** + **Drizzle ORM** (autohosteado en Coolify)
- **iron-session** para auth (admin único MVP via env vars)
- **Resend** para email transaccional
- **date-fns + date-fns-tz** (`America/Argentina/Buenos_Aires`)
- Build: `output: "standalone"` para Docker → Coolify

---

## Quickstart local

Pre-requisitos: Node 22+, Docker Desktop, npm 10+.

```powershell
# 1. Dependencias
npm install

# 2. Variables de entorno
Copy-Item .env.example .env.local

# 3. Generar credenciales para .env.local
npx tsx scripts/hash-password.ts "tu-password-segura"
# Copiá el hash en ADMIN_PASSWORD_HASH

# 4. Generar SESSION_PASSWORD y CANCEL_TOKEN_SECRET (32+ chars cada uno)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 5. Levantar Postgres local (puerto 5433 en host)
docker compose up -d postgres

# 6. Aplicar migraciones
npm run db:migrate

# 7. Dev server
npm run dev
```

App en `http://localhost:3000`. Login admin en `/admin/login`.

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Dev server con HMR |
| `npm run build` | Build de producción |
| `npm run start` | Servir el build |
| `npm run lint` | ESLint (Next config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Genera nuevas migraciones desde `db/schema.ts` |
| `npm run db:migrate` | Aplica las migraciones a la BD apuntada por `DATABASE_URL` |
| `npm run db:studio` | Abre Drizzle Studio (UI para ver datos) |

---

## Deploy a Coolify

Ver [`CLAUDE.md`](./CLAUDE.md#cómo-deployar-a-coolify) para el detalle.

Resumen:
1. Servicio Postgres 16 → connection string
2. App con build pack Dockerfile (raíz del repo)
3. Env vars cargadas en el panel de Coolify
4. Healthcheck path: `/api/health`
5. Post-deploy: `npm run db:migrate`

---

## TODOs visibles del cliente

- [ ] **Dominio para Resend.** Hoy se envía desde `onboarding@resend.dev` (sandbox). Cuando el cliente registre un dominio (ej. `hlstudio.com.ar`), verificarlo en Resend y cambiar `RESEND_FROM_EMAIL`.
- [ ] **Fotos reales de los barberos.** Hoy hay placeholders con iniciales. Cuando lleguen, drop en `public/barberos/<slug>.jpg` y referenciar desde `barberos.foto_url`.
- [ ] **Confirmar precios** del lanzamiento (los del brief son al 2026-05-06).
- [ ] **Handle de Instagram** para conectar el "link en bio".

---

## Estructura

```
app/
  page.tsx                  Landing pública
  reservar/page.tsx         Placeholder de reserva (Sprint 1)
  admin/
    layout.tsx              Layout neutro del segmento /admin
    actions.ts              Server actions: login / logout
    login/page.tsx          Página de login
    login/LoginForm.tsx     Form client component
    (authed)/               Subárbol con guard de sesión
      layout.tsx            Redirige a /admin/login si no hay sesión
      page.tsx              Dashboard skeleton
  api/health/route.ts       Healthcheck
components/
  ui/                       Button, Input, Label, Card (shadcn-style)
  brand/                    Logo, BarberoAvatar
db/
  schema.ts                 Drizzle schema (9 tablas, ver §11 del brief)
  client.ts                 db client compartido
  migrate.ts                Runner de migraciones
drizzle/                    Migraciones SQL generadas
lib/
  env.ts                    Validación Zod de env vars
  session.ts                iron-session setup
  password.ts               scrypt hash + verify
  constants.ts              Strings de UI centralizadas
  utils.ts                  cn()
public/
  logo.png, logo-white.png  Logos
  barberos/                 Fotos reales de los barberos (cuando lleguen)
scripts/
  hash-password.ts          Generador de ADMIN_PASSWORD_HASH
```
