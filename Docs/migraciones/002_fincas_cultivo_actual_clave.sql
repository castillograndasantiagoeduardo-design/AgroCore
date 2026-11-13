-- Migración 002 — AgroCore
-- fincas.cultivo_actual deja de ser texto libre y pasa a guardar la CLAVE del catálogo de cultivos
-- (Backend/packages/database/src/catalogos/catalogo-cultivos.datos.ts), para que el motor de
-- rotaciones pueda aplicar reglas como "no repetir familia botánica".
--
-- Requisito: haber aplicado antes 001_fincas_ubicacion.sql.
-- Si creas la base desde cero con Docs/ddl.sql NO necesitas esta migración.
-- Ejecutar en MySQL Workbench. Es segura de repetir (idempotente).

USE `agrocore`;

-- 1. (Opcional, para revisar) Valores actuales antes de tocar nada.
SELECT id, nombre, cultivo_actual AS cultivo_actual_antes FROM fincas WHERE cultivo_actual IS NOT NULL;

-- 2. Normalizar: sin espacios alrededor, en minúsculas y con guion bajo.
UPDATE fincas
SET cultivo_actual = REPLACE(LOWER(TRIM(cultivo_actual)), ' ', '_')
WHERE cultivo_actual IS NOT NULL;

-- 3. Traducir las formas más comunes de escribirlo a la clave oficial.
UPDATE fincas SET cultivo_actual = 'papa'           WHERE cultivo_actual IN ('papas', 'papa_pastusa', 'papa_criolla', 'papa_r12', 'papa_tocarreña', 'papa_superior');
UPDATE fincas SET cultivo_actual = 'maiz'           WHERE cultivo_actual IN ('maíz', 'maiz_de_clima_frio', 'maíz_de_clima_frío');
UPDATE fincas SET cultivo_actual = 'cebolla_bulbo'  WHERE cultivo_actual IN ('cebolla', 'cebolla_cabezona', 'cebolla_de_bulbo');
UPDATE fincas SET cultivo_actual = 'avena_vicia'    WHERE cultivo_actual IN ('avena', 'avena_forrajera', 'avena_+_vicia', 'avena_y_vicia', 'avena_con_vicia');
UPDATE fincas SET cultivo_actual = 'raigras_trebol' WHERE cultivo_actual IN ('pasto', 'pastos', 'potrero', 'pradera', 'raigras', 'raigrás', 'kikuyo', 'raigrás_+_trébol');
UPDATE fincas SET cultivo_actual = 'tarwi'          WHERE cultivo_actual IN ('chocho', 'lupino');
UPDATE fincas SET cultivo_actual = 'arveja'         WHERE cultivo_actual IN ('alverja', 'arvejas');
UPDATE fincas SET cultivo_actual = 'haba'           WHERE cultivo_actual IN ('habas');
UPDATE fincas SET cultivo_actual = 'quinua'         WHERE cultivo_actual IN ('quinoa');

-- 4. Lo que siga sin coincidir con el catálogo se deja en NULL (la finca se conserva;
--    solo habrá que volver a elegir su cultivo). Revisa primero qué filas son:
SELECT id, nombre, cultivo_actual AS no_reconocido
FROM fincas
WHERE cultivo_actual IS NOT NULL
  AND cultivo_actual NOT IN ('papa', 'arveja', 'haba', 'tarwi', 'cebada', 'trigo', 'avena_vicia', 'quinua', 'maiz', 'cebolla_bulbo', 'raigras_trebol');

UPDATE fincas
SET cultivo_actual = NULL
WHERE cultivo_actual IS NOT NULL
  AND cultivo_actual NOT IN ('papa', 'arveja', 'haba', 'tarwi', 'cebada', 'trigo', 'avena_vicia', 'quinua', 'maiz', 'cebolla_bulbo', 'raigras_trebol');

-- 5. Ajustar la columna al tamaño de una clave y documentarla.
--    No se agrega CHECK ni llave foránea: el catálogo vive en código y la API valida la clave
--    (error FINCA_CULTIVO_DESCONOCIDO) antes de guardar.
ALTER TABLE fincas
  MODIFY COLUMN cultivo_actual VARCHAR(40) NULL COMMENT 'Clave del catalogo de cultivos (ej. papa, avena_vicia)';

-- 6. Resultado final.
SELECT id, nombre, cultivo_actual FROM fincas;
