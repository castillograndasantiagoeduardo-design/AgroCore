-- Migración 001 — AgroCore
-- Agrega ubicación y datos agrícolas a la tabla fincas.
-- Ejecútala SOLO si ya habías corrido Docs/ddl.sql ANTES de este cambio
-- (si creas la base desde cero, Docs/ddl.sql ya incluye estas columnas).
-- Ejecutar en MySQL Workbench con el usuario root.

USE `agrocore`;

ALTER TABLE fincas
  ADD COLUMN latitud DOUBLE NOT NULL AFTER descripcion,
  ADD COLUMN longitud DOUBLE NOT NULL AFTER latitud,
  ADD COLUMN altitud_m INT NULL AFTER longitud,
  ADD COLUMN vereda VARCHAR(80) NULL AFTER altitud_m,
  ADD COLUMN tiene_riego BOOLEAN NOT NULL DEFAULT FALSE AFTER vereda,
  ADD COLUMN cultivo_actual VARCHAR(80) NULL AFTER tiene_riego;
