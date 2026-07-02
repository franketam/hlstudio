-- Custom SQL migration file, put your code below! --

-- El recordatorio corto pasa de T-2h a T-3h (jul-2026).
-- Renombrar las filas existentes preserva la idempotencia: un turno que ya
-- recibió el recordatorio bajo el tipo viejo no vuelve a ser candidato con
-- el tipo nuevo (evita doble envío en las horas posteriores al deploy).
UPDATE "notificaciones_enviadas"
SET "tipo" = 'recordatorio_3h'
WHERE "tipo" = 'recordatorio_2h';
