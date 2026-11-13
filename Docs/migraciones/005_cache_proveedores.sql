-- Migración 005 — AgroCore (caché persistente de proveedores externos)
-- Guarda respuestas de NASA POWER, ORNL MODIS, Overpass, SoilGrids y OpenTopoData
-- para no repetir consultas lentas. Las filas vencen por expira_en.
--
-- La aplica scripts/aplicar-migraciones.ts sobre la base que diga .env (DB_NAME).
-- Idempotente: usa CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS cache_proveedores (
  clave VARCHAR(191) NOT NULL PRIMARY KEY,
  proveedor VARCHAR(40) NOT NULL,
  valor JSON NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en DATETIME NOT NULL,
  INDEX idx_cache_proveedores_expira_en (expira_en)
);
