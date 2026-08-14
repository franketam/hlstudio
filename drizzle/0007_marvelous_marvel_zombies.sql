CREATE TYPE "public"."bloqueo_tipo" AS ENUM('ip', 'email', 'telefono');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bloqueos_acceso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "bloqueo_tipo" NOT NULL,
	"valor" text NOT NULL,
	"motivo" text,
	"turno_origen_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bloqueos_acceso" ADD CONSTRAINT "bloqueos_acceso_turno_origen_id_turnos_id_fk" FOREIGN KEY ("turno_origen_id") REFERENCES "public"."turnos"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bloqueos_acceso_tipo_valor_unique" ON "bloqueos_acceso" USING btree ("tipo","valor");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bloqueos_acceso_activo_idx" ON "bloqueos_acceso" USING btree ("activo");