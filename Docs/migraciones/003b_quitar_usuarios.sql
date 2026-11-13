-- Migración 003b — AgroCore (Fase 0.5: sin login ni roles)
-- La auditoría deja de registrar usuario_id y pasa a registrar el ORIGEN de la solicitud
-- (api | mcp | script). Regla 6 sigue vigente: logs_auditoria sigue siendo append-only
-- (los triggers solo bloquean UPDATE/DELETE de filas; ALTER TABLE está permitido).
--
-- La aplica scripts/aplicar-migraciones.ts sobre la base que diga .env (DB_NAME).
-- Es idempotente: si la columna ya existe, el script lo detecta y sigue.

-- 1. Columna origen en logs_auditoria
ALTER TABLE logs_auditoria
  ADD COLUMN origen VARCHAR(16) NOT NULL DEFAULT 'api' AFTER detalles;

-- 2. usuario_id queda nullable (se conservan los registros antiguos)
ALTER TABLE logs_auditoria
  MODIFY COLUMN usuario_id INT NULL;

-- 3. Lo mismo para logs_mcp_tools
ALTER TABLE logs_mcp_tools
  ADD COLUMN origen VARCHAR(16) NOT NULL DEFAULT 'mcp' AFTER herramienta;

ALTER TABLE logs_mcp_tools
  MODIFY COLUMN usuario_id INT NULL;

-- 4. La tabla usuarios queda EN DESUSO. No se borra (decisión del plan).
--    Para eliminarla, descomenta y ejecútala a mano:
-- DROP TABLE usuarios;
