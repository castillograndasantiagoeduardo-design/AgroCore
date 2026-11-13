-- Migración 004 — AgroCore (Fase 2: ubicación global)
-- La finca puede estar en cualquier lugar del mundo y guardar el polígono de su lote.
--   · area_geojson: polígono GeoJSON (hasta 100 ha, lo valida core)
--   · pais y region
--   · vereda → localidad (vereda, aldea, condado o paraje)
--
-- La aplica scripts/aplicar-migraciones.ts sobre la base que diga .env (DB_NAME).
-- Idempotente: si una columna ya existe o ya se renombró, el script lo detecta y sigue.

ALTER TABLE fincas
  ADD COLUMN area_geojson JSON NULL AFTER altitud_m;

ALTER TABLE fincas
  ADD COLUMN pais VARCHAR(80) NULL AFTER area_geojson;

ALTER TABLE fincas
  ADD COLUMN region VARCHAR(80) NULL AFTER pais;

ALTER TABLE fincas
  RENAME COLUMN vereda TO localidad;
