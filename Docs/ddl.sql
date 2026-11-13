-- DDL MySQL 8 — AgroCore (esquema FINAL para crear la base desde cero)
CREATE DATABASE IF NOT EXISTS `agrocore` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `agrocore`;

-- logs_auditoria: APPEND-ONLY (Regla 7)
CREATE TABLE IF NOT EXISTS logs_auditoria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  accion VARCHAR(100) NOT NULL,
  entidad VARCHAR(100) NOT NULL,
  entidad_id VARCHAR(64) NOT NULL,
  detalles JSON NOT NULL,
  usuario_id INT NULL,
  origen VARCHAR(16) NOT NULL DEFAULT 'api',
  ip VARCHAR(64) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DELIMITER $$
CREATE TRIGGER trg_logs_auditoria_no_update BEFORE UPDATE ON logs_auditoria
FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'logs_auditoria es append-only: UPDATE no permitido';
END$$
CREATE TRIGGER trg_logs_auditoria_no_delete BEFORE DELETE ON logs_auditoria
FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'logs_auditoria es append-only: DELETE no permitido';
END$$
DELIMITER ;

-- logs_mcp_tools: ejecuciones de herramientas MCP
CREATE TABLE IF NOT EXISTS logs_mcp_tools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  herramienta VARCHAR(100) NOT NULL,
  usuario_id INT NULL,
  origen VARCHAR(16) NOT NULL DEFAULT 'api',
  argumentos JSON NULL,
  exito BOOLEAN NOT NULL,
  error TEXT NULL,
  duracion_ms INT NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tablas de módulos
CREATE TABLE IF NOT EXISTS fincas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL UNIQUE,
  descripcion TEXT NULL,
  latitud DOUBLE NOT NULL,
  longitud DOUBLE NOT NULL,
  altitud_m INT NULL,
  area_geojson JSON NULL,
  pais VARCHAR(80) NULL,
  region VARCHAR(80) NULL,
  localidad VARCHAR(80) NULL,
  tiene_riego BOOLEAN NOT NULL DEFAULT FALSE,
  cultivo_actual VARCHAR(40) NULL COMMENT 'Clave del catalogo de cultivos (ej. papa, avena_vicia)',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- cache_proveedores: caché de respuestas de proveedores externos
CREATE TABLE IF NOT EXISTS cache_proveedores (
  clave VARCHAR(191) NOT NULL PRIMARY KEY,
  proveedor VARCHAR(40) NOT NULL,
  valor JSON NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en DATETIME NOT NULL,
  INDEX idx_cache_proveedores_expira_en (expira_en)
);

-- migraciones_aplicadas: la usa scripts/aplicar-migraciones.ts
CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
  archivo VARCHAR(191) NOT NULL PRIMARY KEY,
  aplicada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  avisos TEXT NULL
);
-- @scaffold:tables

-- Si creas la base con este archivo, registra las migraciones como aplicadas corriendo
-- scripts/aplicar-migraciones.ts (detecta lo que ya existe).
