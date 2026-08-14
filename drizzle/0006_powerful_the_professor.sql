ALTER TABLE "turnos" ADD COLUMN "creado_ip" text;--> statement-breakpoint
ALTER TABLE "turnos" ADD COLUMN "creado_user_agent" text;--> statement-breakpoint
ALTER TABLE "turnos" ADD COLUMN "origen" text DEFAULT 'publico' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "turnos_created_at_idx" ON "turnos" USING btree ("created_at");