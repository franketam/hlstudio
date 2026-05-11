CREATE TYPE "public"."estado_pago" AS ENUM('pendiente_local', 'pagado_seña', 'pagado_completo', 'reembolsado');--> statement-breakpoint
CREATE TYPE "public"."turno_estado" AS ENUM('confirmado', 'cancelado_cliente', 'cancelado_admin', 'completado', 'no_show');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "barberos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"foto_url" text,
	"descripcion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bloqueos_agenda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barbero_id" uuid,
	"desde_ts" timestamp with time zone NOT NULL,
	"hasta_ts" timestamp with time zone NOT NULL,
	"motivo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text NOT NULL,
	"email" text NOT NULL,
	"notas_admin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dias_descanso_recurrente" (
	"dia_semana" smallint PRIMARY KEY NOT NULL,
	"motivo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "horarios_operacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dia_semana" smallint NOT NULL,
	"apertura" time NOT NULL,
	"cierre" time NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notificaciones_enviadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turno_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"enviado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"proveedor_id" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "precios_barbero_servicio" (
	"barbero_id" uuid NOT NULL,
	"servicio_id" uuid NOT NULL,
	"precio" numeric(12, 2) NOT NULL,
	"vigente_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "precios_barbero_servicio_barbero_id_servicio_id_pk" PRIMARY KEY("barbero_id","servicio_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "servicios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"duracion_min" smallint NOT NULL,
	"descripcion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "turnos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"barbero_id" uuid NOT NULL,
	"servicio_id" uuid NOT NULL,
	"inicio_ts" timestamp with time zone NOT NULL,
	"fin_ts" timestamp with time zone NOT NULL,
	"estado" "turno_estado" DEFAULT 'confirmado' NOT NULL,
	"precio_total" numeric(12, 2) NOT NULL,
	"estado_pago" "estado_pago" DEFAULT 'pendiente_local' NOT NULL,
	"monto_seña" numeric(12, 2),
	"referencia_pago_externo" text,
	"cancel_token" text NOT NULL,
	"notas" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bloqueos_agenda" ADD CONSTRAINT "bloqueos_agenda_barbero_id_barberos_id_fk" FOREIGN KEY ("barbero_id") REFERENCES "public"."barberos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notificaciones_enviadas" ADD CONSTRAINT "notificaciones_enviadas_turno_id_turnos_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "precios_barbero_servicio" ADD CONSTRAINT "precios_barbero_servicio_barbero_id_barberos_id_fk" FOREIGN KEY ("barbero_id") REFERENCES "public"."barberos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "precios_barbero_servicio" ADD CONSTRAINT "precios_barbero_servicio_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "turnos" ADD CONSTRAINT "turnos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "turnos" ADD CONSTRAINT "turnos_barbero_id_barberos_id_fk" FOREIGN KEY ("barbero_id") REFERENCES "public"."barberos"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "turnos" ADD CONSTRAINT "turnos_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "barberos_activo_idx" ON "barberos" USING btree ("activo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bloqueos_agenda_range_idx" ON "bloqueos_agenda" USING btree ("barbero_id","desde_ts","hasta_ts");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clientes_telefono_unique" ON "clientes" USING btree ("telefono");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clientes_nombre_idx" ON "clientes" USING btree ("nombre");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "horarios_operacion_dia_idx" ON "horarios_operacion" USING btree ("dia_semana");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notif_turno_tipo_unique" ON "notificaciones_enviadas" USING btree ("turno_id","tipo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "servicios_activo_idx" ON "servicios" USING btree ("activo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "turnos_barbero_inicio_idx" ON "turnos" USING btree ("barbero_id","inicio_ts");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "turnos_cliente_inicio_idx" ON "turnos" USING btree ("cliente_id","inicio_ts");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "turnos_estado_idx" ON "turnos" USING btree ("estado");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "turnos_cancel_token_unique" ON "turnos" USING btree ("cancel_token");