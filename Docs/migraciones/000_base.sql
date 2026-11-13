-- Migración 000 — AgroCore: tablas base (forma ORIGINAL del scaffold).
-- Permite partir de una base vacía: las migraciones 001+ agregan después las columnas nuevas.
-- Si las tablas ya existen (base creada con una versión anterior de Docs/ddl.sql), no hace nada.

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

-- fincas en su forma original (001 agrega la ubicación)
CREATE TABLE IF NOT EXISTS fincas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL UNIQUE,
  descripcion TEXT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
