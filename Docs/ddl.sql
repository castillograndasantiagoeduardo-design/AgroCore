-- DDL MySQL 8 — AgroCore
CREATE DATABASE IF NOT EXISTS `agrocore` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `agrocore`;

-- logs_auditoria: APPEND-ONLY (Regla 7)
CREATE TABLE IF NOT EXISTS logs_auditoria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  accion VARCHAR(100) NOT NULL,
  entidad VARCHAR(100) NOT NULL,
  entidad_id VARCHAR(64) NOT NULL,
  detalles JSON NOT NULL,
  usuario_id INT NOT NULL,
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
  usuario_id INT NOT NULL,
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
  vereda VARCHAR(80) NULL,
  tiene_riego BOOLEAN NOT NULL DEFAULT FALSE,
  cultivo_actual VARCHAR(40) NULL COMMENT 'Clave del catalogo de cultivos (ej. papa, avena_vicia)',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(32) NOT NULL DEFAULT 'admin',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- @scaffold:tables
