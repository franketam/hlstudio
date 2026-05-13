import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  smallint,
  numeric,
  boolean,
  pgEnum,
  primaryKey,
  index,
  uniqueIndex,
  time,
  date,
} from "drizzle-orm/pg-core";

/**
 * Schema HLstudio. Sigue §11 del brief.
 *
 * Notas de diseño:
 * - Todo en UTC (`timestamp { withTimezone: true }`). Conversión a TZ del local
 *   se hace en la capa de presentación con date-fns-tz.
 * - IDs uuid v4 (gen_random_uuid) para entidades expuestas al cliente.
 * - Auth admin NO está modelado en BD (MVP: env vars). Se agrega cuando escale.
 * - Anti doble-booking: validación a nivel server + en una pasada futura,
 *   constraint EXCLUDE USING gist con btree_gist (lo agregamos via SQL custom
 *   en una migración cuando lo activemos en Sprint 1, no lo expone Drizzle).
 */

// ---------- Enums ----------

export const turnoEstadoEnum = pgEnum("turno_estado", [
  "confirmado",
  "cancelado_cliente",
  "cancelado_admin",
  "completado",
  "no_show",
]);

export const estadoPagoEnum = pgEnum("estado_pago", [
  "pendiente_local",
  "pagado_seña",
  "pagado_completo",
  "reembolsado",
]);

// ---------- Tablas ----------

export const barberos = pgTable(
  "barberos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    nombre: text("nombre").notNull(),
    fotoUrl: text("foto_url"),
    descripcion: text("descripcion"),
    // Email del barbero — recibe notificación cuando le crean un turno.
    // Nullable: si está vacío, se omite el envío al barbero (cliente sí recibe).
    email: text("email"),
    // Teléfono del barbero en E.164 (+549...). Si está cargado, las notificaciones
    // se envían por WhatsApp en vez de email (decisión del cliente: WA reemplaza email).
    // Si null, se mantiene el fallback email — preserva backward compat para barberos
    // viejos no migrados al schema nuevo.
    telefono: text("telefono"),
    activo: boolean("activo").notNull().default(true),
    orden: smallint("orden").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    activoIdx: index("barberos_activo_idx").on(t.activo),
  })
);

export const servicios = pgTable(
  "servicios",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    nombre: text("nombre").notNull(),
    duracionMin: smallint("duracion_min").notNull(),
    descripcion: text("descripcion"),
    activo: boolean("activo").notNull().default(true),
    orden: smallint("orden").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    activoIdx: index("servicios_activo_idx").on(t.activo),
  })
);

/**
 * Precio del servicio S del barbero B.
 * PK compuesto (barbero, servicio). Si no hay fila, ese barbero no ofrece ese servicio.
 */
export const preciosBarberoServicio = pgTable(
  "precios_barbero_servicio",
  {
    barberoId: uuid("barbero_id")
      .notNull()
      .references(() => barberos.id, { onDelete: "cascade" }),
    servicioId: uuid("servicio_id")
      .notNull()
      .references(() => servicios.id, { onDelete: "cascade" }),
    precio: numeric("precio", { precision: 12, scale: 2 }).notNull(),
    vigenteDesde: timestamp("vigente_desde", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.barberoId, t.servicioId] }),
  })
);

/**
 * Horarios de operación del local. dia_semana: 0 (domingo) … 6 (sábado).
 * Permite múltiples filas por día (turno mañana / tarde).
 */
export const horariosOperacion = pgTable(
  "horarios_operacion",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    diaSemana: smallint("dia_semana").notNull(), // 0..6
    apertura: time("apertura").notNull(), // 'HH:mm:ss', interpretado en TZ del local
    cierre: time("cierre").notNull(),
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    diaIdx: index("horarios_operacion_dia_idx").on(t.diaSemana),
  })
);

/**
 * Días de descanso fijos (recurrentes). Ej: domingo y lunes.
 */
export const diasDescansoRecurrente = pgTable("dias_descanso_recurrente", {
  diaSemana: smallint("dia_semana").primaryKey(), // 0..6
  motivo: text("motivo"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Bloqueos puntuales: vacaciones, ausencia, feriado.
 * Si barbero_id es null → bloquea todo el local.
 */
export const bloqueosAgenda = pgTable(
  "bloqueos_agenda",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    barberoId: uuid("barbero_id").references(() => barberos.id, {
      onDelete: "cascade",
    }),
    desdeTs: timestamp("desde_ts", { withTimezone: true }).notNull(),
    hastaTs: timestamp("hasta_ts", { withTimezone: true }).notNull(),
    motivo: text("motivo"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    rangeIdx: index("bloqueos_agenda_range_idx").on(
      t.barberoId,
      t.desdeTs,
      t.hastaTs
    ),
  })
);

/**
 * Cliente final. Identificación por teléfono (E.164 normalizado).
 * Sin cuenta de auth — guest reservation.
 */
export const clientes = pgTable(
  "clientes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    nombre: text("nombre").notNull(),
    telefono: text("telefono").notNull(), // E.164: +54911...
    // Email opcional: el flow público lo exige a nivel UI/server, pero el admin
    // puede crear walk-ins sin email (cliente que no quiere darlo).
    email: text("email"),
    notasAdmin: text("notas_admin"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    telefonoUnique: uniqueIndex("clientes_telefono_unique").on(t.telefono),
    nombreIdx: index("clientes_nombre_idx").on(t.nombre),
  })
);

/**
 * Turno. Núcleo del dominio.
 * fin_ts se materializa para queries de solapamiento eficientes.
 * cancel_token es el secret HMAC firmado que va en el link único al cliente.
 */
export const turnos = pgTable(
  "turnos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    barberoId: uuid("barbero_id")
      .notNull()
      .references(() => barberos.id, { onDelete: "restrict" }),
    servicioId: uuid("servicio_id")
      .notNull()
      .references(() => servicios.id, { onDelete: "restrict" }),
    inicioTs: timestamp("inicio_ts", { withTimezone: true }).notNull(),
    finTs: timestamp("fin_ts", { withTimezone: true }).notNull(),
    estado: turnoEstadoEnum("estado").notNull().default("confirmado"),
    precioTotal: numeric("precio_total", {
      precision: 12,
      scale: 2,
    }).notNull(),
    estadoPago: estadoPagoEnum("estado_pago")
      .notNull()
      .default("pendiente_local"),
    montoSeña: numeric("monto_seña", { precision: 12, scale: 2 }),
    referenciaPagoExterno: text("referencia_pago_externo"),
    cancelToken: text("cancel_token").notNull(),
    notas: text("notas"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    barberoInicioIdx: index("turnos_barbero_inicio_idx").on(
      t.barberoId,
      t.inicioTs
    ),
    clienteInicioIdx: index("turnos_cliente_inicio_idx").on(
      t.clienteId,
      t.inicioTs
    ),
    estadoIdx: index("turnos_estado_idx").on(t.estado),
    cancelTokenUnique: uniqueIndex("turnos_cancel_token_unique").on(
      t.cancelToken
    ),
  })
);

/**
 * Log de notificaciones enviadas (idempotencia para los recordatorios T-24h / T-2h).
 * Evita doble envío si el cron se reejecuta.
 */
export const notificacionesEnviadas = pgTable(
  "notificaciones_enviadas",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    turnoId: uuid("turno_id")
      .notNull()
      .references(() => turnos.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(), // 'confirmacion_cliente' | 'confirmacion_barbero' | 'recordatorio_24h' | 'recordatorio_2h' | 'cancelacion'
    // Canal por el que se mandó. 'email' = Resend, 'whatsapp' = bot Baileys interno.
    // Default 'email' para backward-compat con filas previas y casos donde no
    // se especifique explícitamente.
    canal: text("canal").notNull().default("email"),
    enviadoAt: timestamp("enviado_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    proveedorId: text("proveedor_id"), // id que devuelve Resend / mensaje id de WA
    error: text("error"),
  },
  (t) => ({
    // Unique compuesto incluye canal: el mismo turno puede tener registros de
    // recordatorio_24h por email y por whatsapp (lados separados), uno por canal.
    turnoTipoCanalUnique: uniqueIndex("notif_turno_tipo_canal_unique").on(
      t.turnoId,
      t.tipo,
      t.canal
    ),
  })
);

// ---------- Tipos derivados ----------

export type Barbero = typeof barberos.$inferSelect;
export type NuevoBarbero = typeof barberos.$inferInsert;
export type Servicio = typeof servicios.$inferSelect;
export type NuevoServicio = typeof servicios.$inferInsert;
export type Cliente = typeof clientes.$inferSelect;
export type NuevoCliente = typeof clientes.$inferInsert;
export type Turno = typeof turnos.$inferSelect;
export type NuevoTurno = typeof turnos.$inferInsert;
export type HorarioOperacion = typeof horariosOperacion.$inferSelect;
export type BloqueoAgenda = typeof bloqueosAgenda.$inferSelect;
export type PrecioBarberoServicio = typeof preciosBarberoServicio.$inferSelect;

// Las exports `date` y `integer` no se usan acá pero se mantienen por si el schema crece.
export { date, integer };
