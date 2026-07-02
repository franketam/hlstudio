# Brief Cliente — HLstudio

> Generado por needs-discovery el 2026-05-06
> Documento de entrada principal para el agente `fullstack-dev`. Léelo entero antes de tocar código.

---

## 0. TL;DR (lectura de 30 segundos)

Sistema web de reservas para **HLstudio**, barbería de gama alta en Chivilcoy (Buenos Aires). 2 barberos con agendas independientes, atienden martes a sábado en dos turnos partidos. Reemplaza un proceso manual fragmentado entre WhatsApp + DM de Instagram + libreta. MVP: reserva guest mobile-first con confirmación y recordatorios por email, panel admin con ficha de cliente y agenda diaria/semanal. Pago en local, sin seña en MVP, pero el modelo de datos queda preparado para Mercado Pago en v2. Estética: blanco y negro moderno, profesional, élite.

---

## 1. Negocio

| Campo | Valor |
|-------|-------|
| Nombre | HLstudio |
| Ubicación | Chivilcoy, Buenos Aires, Argentina |
| Estado | Abierta y operando |
| Web/IG actual | TODO — pedirle handle de Instagram al cliente para conectar el "link en bio" como puerta principal de entrada |
| Tipo de barbería | Gama alta / élite (posicionamiento) |

---

## 2. Objetivo del proyecto

**Eliminar la manualidad y la dispersión** del proceso actual de reserva de turnos. Hoy los turnos se gestionan en simultáneo por WhatsApp, DM de Instagram y una libreta en el mostrador, lo que produce inconsistencias, doble-booking potencial y pérdida de información del cliente.

### Éxito = cuando se cumpla esto:
1. El 100% de los turnos nuevos viven en una sola fuente de verdad (la base de datos del sistema).
2. El cliente puede reservar desde el celular en menos de 60 segundos sin hablar con nadie.
3. El barbero / dueño abre el panel a la mañana y ve la jornada completa de los dos barberos.
4. El sistema reconoce al cliente recurrente automáticamente sin pedirle registrar cuenta.
5. El no-show baja respecto del baseline actual (objetivo blando, no medible aún).

### Dolores que resuelve (priorizados)
1. **Manualidad y dispersión del proceso** (dolor #1, motor del proyecto).
2. **Ausentismo / no-show moderado** (dolor #2, mitigado parcialmente por recordatorios por email; sin WhatsApp el efecto es limitado, ver §8).

---

## 3. Operativa actual del local

### 3.1 Equipo
- 2 barberos.
- Atienden **en paralelo** (no se turnan).
- **Agendas independientes**: el cliente elige con quién quiere atenderse.
- **Intercambiables visualmente**: no hay etiqueta tipo "junior/senior" ni "especialista en X". Cada uno se muestra como tarjeta con foto + nombre + descripción opcional.

### 3.2 Horario
- **Días laborables**: martes a sábado.
- **Días de descanso fijos**: domingo y lunes (ambos barberos, todas las semanas).
- **Horario de atención**: 10:00–13:00 y 15:00–20:00 (turno partido con corte al mediodía).

### 3.3 Servicios

| Servicio | Duración | Precio referencia | Notas |
|----------|----------|-------------------|-------|
| Corte | 30 min | $16.000 | Lo hacen los dos |
| Corte + Barba | 45 min | $18.000 | Lo hacen los dos |
| Barba | 15 min | $7.000 | Lo hacen los dos |

> Precios al 2026-05-06. **Confirmar con el cliente si son los definitivos al lanzar.**

### 3.4 Precios por barbero
- Cada barbero puede cobrar **distinto** por el mismo servicio.
- El precio mostrado al cliente al elegir horario es el del barbero seleccionado.
- Implica modelo `precio_servicio_por_barbero` (ver §11).

---

## 4. Usuarios del sistema

### 4.1 Cliente final (quien reserva)
- Reserva como **guest**, sin crear cuenta.
- **Datos obligatorios**: nombre, teléfono, email.
- **Reconocimiento de recurrente**: el sistema matchea por teléfono. Si vuelve, su historial está atado.
- **Dispositivo dominante**: mobile (celular). El acceso principal será link en bio de Instagram y DMs. Desktop debe estar cómodo pero no es prioridad.

### 4.2 Admin / dueño / barberos
- Operan el panel admin.
- Nivel tech: asumir bajo-medio (3/5). Son barberos, no operadores de software.
- **El admin debe ser a prueba de balas en celular** — el dueño va a revisar la agenda desde el celular en el local.
- **Todo configurable sin tocar código** (ver §6.4).

---

## 5. Alcance del MVP (must-have)

### 5.1 Flujo público de reserva
1. Landing con identidad visual (blanco/negro élite, ver §10).
2. Pantalla "elegí barbero" → tarjetas con foto + nombre + descripción opcional.
3. Pantalla "elegí servicio" → muestra los servicios con la duración y el precio del barbero elegido.
4. Pantalla "elegí día y horario" → calendario / lista de slots disponibles según agenda y duración del servicio.
5. Pantalla "tus datos" → nombre, teléfono, email obligatorios.
6. Pantalla "confirmación" → resumen del turno + aviso de que llegará un email.
7. Email de confirmación inmediato con **link único** de gestión del turno (cancelar / reprogramar).

**Criterio de aceptación del flujo público**: un cliente puede ir desde la landing al "turno confirmado" en menos de 60 segundos en celular.

### 5.2 Gestión del turno por el cliente (vía link único)
- Link firmado, único por turno, no requiere login.
- Permite **cancelar hasta 3 horas antes** del turno.
- Pasadas las 3hs, el link muestra: *"Ya no podés cancelar online. Comunicate con el barbero."* (no se permite cancelación tardía autoservicio).
- Reprogramar: opcional en MVP, **se sugiere "cancelar y volver a reservar"** para no inflar scope. Confirmar con cliente si quiere reprogramación in-place.

### 5.3 Panel admin (Opción A — gestión de clientes)
- **Login del admin** (Supabase Auth, email + password).
- **Vista de agenda del día** con los dos barberos en paralelo (columnas o tabs).
- **Vista de agenda de la semana**.
- **Ficha de cliente**:
  - Buscar por nombre o teléfono.
  - Ver todos los turnos pasados: barbero, servicio, fecha.
  - Frecuencia (cuándo fue la última vez, cada cuánto viene).
  - Datos de contacto.
- **Cliente como entidad de primera clase** en el modelo de datos.

### 5.4 Configuración (sin tocar código)
Todo lo siguiente se edita desde el panel admin:
- Horarios de atención del local.
- Días de descanso recurrentes.
- Servicios: nombre, duración, descripción.
- Precio por servicio **por barbero**.
- Datos de cada barbero: foto, nombre, descripción opcional.
- (Recomendado, ver §13) Bloqueo puntual de agenda por día (vacaciones, ausencia).

### 5.5 Notificaciones por email
- **T0**: Email de confirmación al reservar (inmediato), incluye link único de gestión.
- **T-24h**: Recordatorio 24 horas antes del turno.
- **T-3h**: Recordatorio 3 horas antes del turno (era T-2h; se movió a 3h en jul-2026, coincide con el corte de cancelación online).
- Proveedor sugerido: **Resend** (free tier 3.000/mes alcanza para arrancar).
- WhatsApp queda **fuera de MVP** (ver §12).

---

## 6. Requerimientos funcionales clave (resumen accionable)

| ID | Requerimiento | Prioridad |
|----|---------------|-----------|
| RF-01 | Reserva guest en menos de 60s en mobile | MUST |
| RF-02 | Selección de barbero antes que servicio | MUST |
| RF-03 | Slots disponibles calculados según agenda del barbero, duración del servicio y bloqueos | MUST |
| RF-04 | Email de confirmación con link único firmado | MUST |
| RF-05 | Recordatorios T-24h y T-3h | MUST |
| RF-06 | Cancelación autoservicio hasta T-3h | MUST |
| RF-07 | Reconocimiento de cliente recurrente por teléfono | MUST |
| RF-08 | Panel admin con agenda día/semana | MUST |
| RF-09 | Ficha de cliente con historial e índice por nombre/teléfono | MUST |
| RF-10 | CRUD de barberos, servicios, precios por barbero, horarios y descansos | MUST |
| RF-11 | Bloqueo puntual de agenda (ausencia) | SHOULD (confirmar) |
| RF-12 | Crear turno manual desde el panel (walk-in) | SHOULD (confirmar) |
| RF-13 | Reprogramar turno desde el link del cliente (en vez de cancelar+rebookear) | NICE-TO-HAVE |

---

## 7. Requerimientos no funcionales

- **Mobile-first** sin ser agresivo: desktop debe ser cómodo, mobile debe ser excelente.
- **Performance**: Lighthouse mobile > 90 en landing y flujo de reserva.
- **Disponibilidad**: alcance free tiers (Vercel + Supabase + Resend) hasta volúmen del local. No SLA contractual.
- **Accesibilidad básica**: contraste AA, navegación por teclado en panel admin.
- **i18n**: solo es-AR. No multi-idioma.
- **Zona horaria**: `America/Argentina/Buenos_Aires` hardcoded por ahora (un solo local).
- **Concurrencia**: prevenir doble-booking del mismo slot ante reservas simultáneas (lock optimista o constraint a nivel BD).
- **Seguridad**:
  - Link de gestión del turno: token firmado (HMAC) + expiración o flag de uso, no IDs adivinables.
  - Admin: Supabase Auth, sesión segura, RLS en Supabase para que el frontend público no pueda leer datos de clientes.

---

## 8. Comunicaciones (notificaciones)

| Evento | Canal MVP | Canal v2 (deseado) | Proveedor MVP |
|--------|-----------|--------------------|----|
| Confirmación de turno | Email | + WhatsApp | Resend |
| Recordatorio T-24h | Email | + WhatsApp | Resend |
| Recordatorio T-3h | Email | + WhatsApp | Resend |
| Cancelación confirmada | Email | + WhatsApp | Resend |

> **Aviso al cliente final del proyecto**: sin WhatsApp, el efecto sobre no-show es parcial (~10–18% vs ~5–10% con WhatsApp). Si el ausentismo no baja lo esperado, la palanca v2 es **WhatsApp + seña**.

---

## 9. Pagos

- **MVP**: sin pagos online. Pago en el local, sin seña.
- **v2**: integración con **Mercado Pago** para seña o pago anticipado.
- **Implicancia para el modelo de datos (importante)**: la entidad `Turno` debe incluir desde el día 1 los campos:
  - `estado_pago` (enum: `pendiente_local | pagado_seña | pagado_completo | reembolsado`),
  - `monto_seña` (nullable, decimal),
  - `monto_total` (decimal, snapshot del precio al momento de reservar),
  - `referencia_pago_externo` (nullable, string).

Así v2 enchufa Mercado Pago sin migración destructiva.

---

## 10. Identidad visual

- **No hay marca formal definida**. El cliente deja el logo en `assets/` (carpeta del proyecto).
- **Dirección estética obligatoria**: blanco y negro moderno, profesional, élite. Barbería de gama alta, **no** chiringuito de barrio.
- **A construir desde cero por el dev**: paleta exacta, tipografías, escalas, espaciados, microinteracciones, componentes shadcn customizados.
- **Recomendaciones del consultor** (no atadas, decidir en Sprint 0):
  - Tipografía display: serif moderno (Playfair, Cormorant) o sans geométrico de alto contraste (Inter Tight, Space Grotesk).
  - Tipografía body: sans neutro (Inter, Geist).
  - Paleta: negro `#0A0A0A`, blanco `#FAFAFA`, un gris medio para divisiones, un acento mínimo (oro suave / off-white) opcional.
  - Microinteracciones sobrias, sin glitter ni neon.
  - Fotografía/imágenes en blanco y negro alto contraste si el cliente provee.

---

## 11. Modelo de datos sugerido (alto nivel)

```
Barbero
  id, nombre, foto_url, descripcion?, activo, created_at

Servicio
  id, nombre, duracion_min, descripcion?, activo, created_at

PrecioBarberoServicio          // precio del servicio S del barbero B
  barbero_id, servicio_id, precio, vigente_desde
  PK compuesto (barbero_id, servicio_id) o por versión

HorarioOperacion               // horarios del local; un solo local por ahora
  dia_semana (0–6), apertura, cierre   // permite múltiples filas por día (turno mañana / tarde)

DiaDescansoRecurrente          // ej. domingo y lunes
  dia_semana

BloqueoAgenda                  // ausencias puntuales / vacaciones
  id, barbero_id (nullable si bloquea todo el local), desde_ts, hasta_ts, motivo?

Cliente                        // entidad de primera clase
  id, nombre, telefono (UNIQUE), email, notas_admin?, created_at, updated_at

Turno
  id,
  cliente_id,
  barbero_id,
  servicio_id,
  inicio_ts, fin_ts,            // fin_ts derivado pero materializado para queries
  estado (enum: confirmado | cancelado_cliente | cancelado_admin | completado | no_show),
  precio_total,                  // snapshot
  estado_pago (enum: pendiente_local | pagado_seña | pagado_completo | reembolsado),
  monto_seña?,
  referencia_pago_externo?,      // para v2 MP
  cancel_token,                  // para link único firmado
  created_at, updated_at,
  CONSTRAINT no overlap (barbero_id, [inicio_ts, fin_ts))   // EXCLUDE / lógica server

UsuarioAdmin                   // gestionado por Supabase Auth
  id (auth.users.id), rol (admin | barbero), barbero_id?
```

### Reglas de negocio críticas
- Un slot está disponible si: el barbero atiende ese día (no es descanso, no hay BloqueoAgenda) **Y** está dentro de HorarioOperacion **Y** no se solapa con otro Turno del mismo barbero **Y** la duración del servicio cabe antes del cierre del bloque horario.
- Cliente recurrente: al reservar, si el `telefono` matchea un `Cliente` existente, el turno se ata a ese ID y se actualizan nombre/email si vienen distintos (con cuidado, podría ser otra persona usando el mismo número — TODO con cliente).
- Cancelación: solo válida si `now < inicio_ts - 3h`.
- Constraint anti doble-booking: idealmente a nivel BD (Postgres `EXCLUDE USING gist`) o validación + transacción serializable.

---

## 12. Out of scope MVP (explícito)

| Item | Cuándo | Notas |
|------|--------|-------|
| WhatsApp Business API (recordatorios + reservas) | v2 | El cliente lo va a pedir. Sin acceso a la API en esta etapa. Avisar que la adopción y el efecto anti-no-show serán menores sin esto. |
| Pago anticipado / seña vía Mercado Pago | v2 | Modelo de datos preparado, integración no. |
| Programa de fidelidad / cupones / promos por día | v2+ | No solicitado, no asumir. |
| Reserva de varios servicios en simultáneo (ej. dos hijos) | TBD | No se preguntó al cliente. Si surge, escalarlo. |
| Multi-sucursal / multi-tenant | No previsto | Un solo local. |
| Inquilinato de sillón / comisiones por barbero | No aplica | Modelo de empleados directos. |
| Caja / contabilidad / facturación AFIP | No solicitado | Fuera. |
| App nativa | No previsto | Web responsive. |

---

## 13. Preguntas abiertas / TODOs con el cliente

> Estas son las preguntas que el cliente final de Martín tiene que confirmar. El dev puede arrancar con supuestos razonables, pero conviene validar antes de pulido final.

1. Confirmar **nombres y fotos reales** de los dos barberos.
2. Confirmar si los **precios actuales** son los del lanzamiento o cambian.
3. **Política de tolerancia** para cliente que llega tarde: ¿se libera el slot a los X minutos de atraso? ¿Cuántos? Supuesto: no se libera automático, queda a criterio del barbero, el slot sigue ocupado hasta el `fin_ts`.
4. **Bloqueo puntual** de agenda (RF-11): confirmar que el admin puede marcar "hoy el barbero no viene" además de los descansos recurrentes. Supuesto: SÍ, va incluido.
5. **Vacaciones / ausencias largas**: confirmar que se modela como rango (BloqueoAgenda con `desde_ts` / `hasta_ts`). Supuesto: SÍ.
6. **Crear turno manual desde el panel** (walk-in): cliente cae al local sin reserva, el barbero le carga el turno a posteriori para que entre en el historial. Supuesto fuerte: SÍ, conviene incluirlo.
7. **Reprogramación** vs cancelar+rebookear: ¿el link del cliente permite mover el turno o solo cancelar? Supuesto inicial: solo cancelar (más simple, scope acotado).
8. **Handle de Instagram / web actual** para conectar el "link en bio".
9. **Match por teléfono**: si dos personas distintas comparten teléfono (familia), ¿cómo se modela? Supuesto: un teléfono = un cliente, los datos del último turno sobreescriben. Confirmar.
10. **Plazo de entrega** y **presupuesto** para servicios externos pagos cuando escale (Vercel/Supabase/Resend) — no definidos.

---

## 14. Stack confirmado

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui.
- **Backend / BD**: Supabase (Postgres + Auth + RLS).
- **Email transaccional**: Resend (free tier).
- **Hosting**: Vercel.
- **Pagos**: ninguno en MVP. Mercado Pago en v2 (modelo preparado).
- **Mensajería**: ninguna fuera de email en MVP. WhatsApp Business en v2.
- **Zona horaria**: `America/Argentina/Buenos_Aires` hardcoded.
- **Idioma**: es-AR único.

---

## 15. Roadmap propuesto

### Sprint 0 — Setup (estimado 2–3 días)
- Repo, Next.js 15, TS, Tailwind, shadcn/ui, ESLint/Prettier.
- Supabase: proyecto, schema inicial (entidades de §11), RLS básica.
- Resend: API key, plantilla base.
- Vercel: deploy preview funcionando.
- Logo en `/assets`, sistema de design tokens (colores, tipografías) tomado de §10.
- Layout base público + layout base admin con login Supabase.

### Sprint 1 — MVP demostrable (estimado 7–10 días)
- Flujo público de reserva completo (RF-01 a RF-04, RF-07).
- Cálculo de slots disponibles correcto (RF-03) con anti-doble-booking.
- Email de confirmación + link único firmado (RF-04, RF-06).
- Panel admin: login + agenda día/semana (RF-08).
- CRUD básico de barberos, servicios, precios por barbero, horarios, descansos (RF-10).
- Estética blanco/negro élite aplicada.

### Sprint 2 — Producción (estimado 5–7 días)
- Recordatorios T-24h y T-3h (RF-05) con job programado (Vercel Cron / Supabase Edge / Resend Schedules).
- Ficha de cliente con historial y búsqueda (RF-09).
- Bloqueo puntual de agenda (RF-11).
- Crear turno manual desde el panel (RF-12).
- QA mobile real, accesibilidad, performance, hardening de seguridad (RLS exhaustivo, validación tokens).
- Onboarding del dueño: carga inicial de barberos, servicios, precios, horarios.

---

## 16. Riesgos identificados

1. **Sin WhatsApp, el efecto anti-no-show es limitado**. Si el cliente esperaba la bala de plata, hay que setearlo: el dolor #2 se mitiga parcialmente. Palanca v2 = WhatsApp + seña.
2. **Concurrencia de reservas**: dos clientes reservando el mismo slot al mismo tiempo. Mitigar con constraint a nivel BD desde Sprint 1, no dejarlo para "después".
3. **Match por teléfono ambiguo**: familias compartiendo número pueden generar mezcla de historial. Confirmar con cliente y, si es problema, agregar "es otra persona" en el flujo.
4. **El logo todavía no está**. Bloquea pulido visual de Sprint 1. Pedirlo en Sprint 0 o avanzar con placeholder textual de tipografía pura.
5. **Adopción mobile real**: la mayoría entra desde Instagram. Si la landing no carga rápido o no inspira "élite" en los primeros 2 segundos, el cliente vuelve al DM y se pierde el dolor #1.

---

## 17. Definition of Done del MVP

El MVP se considera entregado cuando:
- [ ] Un cliente puede reservar desde el celular en <60s y recibir email de confirmación.
- [ ] El cliente puede cancelar desde el link hasta 3hs antes.
- [ ] Recordatorios T-24h y T-3h se envían automáticamente.
- [ ] El dueño puede entrar al panel desde el celular y ver la agenda del día y de la semana.
- [ ] El dueño puede buscar un cliente por nombre o teléfono y ver su historial.
- [ ] El dueño puede editar barberos, servicios, precios por barbero, horarios y descansos sin tocar código.
- [ ] No es posible que dos turnos del mismo barbero se solapen (verificado con test concurrente).
- [ ] Lighthouse mobile > 90 en la landing y en el flujo de reserva.
- [ ] Estética blanco/negro élite aplicada coherentemente.

---

*Fin del brief. Cuando arranques, leelo entero. Si algo no cierra con el código actual del repo, este brief gana — o levantá la duda antes de codear.*
