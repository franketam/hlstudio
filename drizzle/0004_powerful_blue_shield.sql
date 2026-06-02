CREATE TABLE IF NOT EXISTS "bloqueos_recurrentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"barbero_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"desde_hora" time NOT NULL,
	"hasta_hora" time NOT NULL,
	"motivo" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bloqueos_recurrentes" ADD CONSTRAINT "bloqueos_recurrentes_barbero_id_barberos_id_fk" FOREIGN KEY ("barbero_id") REFERENCES "public"."barberos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bloqueos_recurrentes_barbero_dia_idx" ON "bloqueos_recurrentes" USING btree ("barbero_id","dia_semana");