DROP INDEX IF EXISTS "notif_turno_tipo_unique";--> statement-breakpoint
ALTER TABLE "barberos" ADD COLUMN "telefono" text;--> statement-breakpoint
ALTER TABLE "notificaciones_enviadas" ADD COLUMN "canal" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notif_turno_tipo_canal_unique" ON "notificaciones_enviadas" USING btree ("turno_id","tipo","canal");