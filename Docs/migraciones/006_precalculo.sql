-- Migración 006 — AgroCore (precálculo regional: respuesta instantánea)
-- Guarda en MySQL lo que la etapa rápida pide a los proveedores externos, para la región precalculada:
--   clima (serie diaria de NASA POWER por celda), vías/edificaciones/agua (OpenStreetMap),
--   cobertura MODIS MCD12Q1, elevación SRTM en grilla de 0,01° y el avance del precálculo (reanudable).
--
-- Geometrías: SRID 4326. Se escriben y se leen SIEMPRE con 'axis-order=long-lat' (WKT "lon lat"):
--   ST_GeomFromText(wkt, 4326, 'axis-order=long-lat')  y  ST_AsText(geom, 'axis-order=long-lat').
--
-- La aplica scripts/aplicar-migraciones.ts. Idempotente (CREATE TABLE IF NOT EXISTS). No destructiva.

-- Serie diaria de 30 años por celda de NASA POWER (0,5° x 0,625°), gzip de la SerieClimatica en JSON.
CREATE TABLE IF NOT EXISTS precalculo_celdas (
  celda_i INT NOT NULL,
  celda_j INT NOT NULL,
  latitud DECIMAL(9,6) NOT NULL,
  longitud DECIMAL(9,6) NOT NULL,
  altitud_celda_m DOUBLE NOT NULL,
  serie_diaria MEDIUMBLOB NOT NULL,
  desde DATE NOT NULL,
  hasta DATE NOT NULL,
  recomendacion JSON NULL,
  version_motor VARCHAR(20) NULL,
  fuente VARCHAR(120) NOT NULL,
  generado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (celda_i, celda_j)
);

CREATE TABLE IF NOT EXISTS vias_region (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  osm_id BIGINT NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  nombre VARCHAR(200) NULL,
  geom LINESTRING NOT NULL SRID 4326,
  UNIQUE KEY uq_vias_region_osm (osm_id),
  SPATIAL INDEX sp_vias_region_geom (geom)
);

CREATE TABLE IF NOT EXISTS edificaciones_region (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  osm_id BIGINT NOT NULL,
  geom POLYGON NOT NULL SRID 4326,
  UNIQUE KEY uq_edificaciones_region_osm (osm_id),
  SPATIAL INDEX sp_edificaciones_region_geom (geom)
);

-- tipo: 'poligono' (lagos, embalses), 'river' o 'canal' (ejes lineales).
CREATE TABLE IF NOT EXISTS agua_region (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  osm_id BIGINT NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  geom GEOMETRY NOT NULL SRID 4326,
  UNIQUE KEY uq_agua_region_osm (osm_id),
  SPATIAL INDEX sp_agua_region_geom (geom)
);

-- Bloques del subset MODIS MCD12Q1 (LC_Type1): rejilla sinusoidal (xll, yll en metros), datos = 1 byte por píxel, fila 0 al norte.
CREATE TABLE IF NOT EXISTS cobertura_region (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  clave VARCHAR(40) NOT NULL,
  xll DOUBLE NOT NULL,
  yll DOUBLE NOT NULL,
  cellsize DOUBLE NOT NULL,
  nrows INT NOT NULL,
  ncols INT NOT NULL,
  anio SMALLINT NOT NULL,
  fuente VARCHAR(120) NOT NULL,
  datos MEDIUMBLOB NOT NULL,
  UNIQUE KEY uq_cobertura_region_clave (clave)
);

-- Grilla de 0,01°: i = round(latitud * 100), j = round(longitud * 100).
CREATE TABLE IF NOT EXISTS elevacion_region (
  i INT NOT NULL,
  j INT NOT NULL,
  elevacion_m SMALLINT NOT NULL,
  PRIMARY KEY (i, j)
);

-- Avance del precálculo: permite reanudar (solo se repiten los bloques que no están en 'listo').
-- tipo: clima | vias | cobertura | elevacion | presencia.
CREATE TABLE IF NOT EXISTS precalculo_bloques (
  tipo VARCHAR(20) NOT NULL,
  clave VARCHAR(60) NOT NULL,
  estado ENUM('pendiente','listo','error') NOT NULL DEFAULT 'pendiente',
  intentos INT NOT NULL DEFAULT 0,
  detalle VARCHAR(300) NULL,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tipo, clave),
  INDEX idx_precalculo_bloques_estado (tipo, estado)
);
