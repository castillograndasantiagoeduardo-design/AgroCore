/**
 * Tablas del precálculo regional. Deben coincidir con Docs/migraciones/006_precalculo.sql.
 * Las columnas espaciales y los BLOB se declaran con customType; las consultas espaciales usan SQL directo
 * (ST_GeomFromText con 'axis-order=long-lat', MBRIntersects) en los repositorios.
 */
import { customType, double, int, json, mysqlEnum, mysqlTable, primaryKey, smallint, timestamp, varchar, date, decimal, bigint } from "drizzle-orm/mysql-core";

const blob = customType<{ data: Uint8Array }>({ dataType: () => "mediumblob" });
const geometria = customType<{ data: string }>({ dataType: () => "geometry" });

export const precalculoCeldasTable = mysqlTable("precalculo_celdas", {
  celdaI: int("celda_i").notNull(),
  celdaJ: int("celda_j").notNull(),
  latitud: decimal("latitud", { precision: 9, scale: 6 }).notNull(),
  longitud: decimal("longitud", { precision: 9, scale: 6 }).notNull(),
  altitudCeldaM: double("altitud_celda_m").notNull(),
  serieDiaria: blob("serie_diaria").notNull(),
  desde: date("desde", { mode: "string" }).notNull(),
  hasta: date("hasta", { mode: "string" }).notNull(),
  recomendacion: json("recomendacion"),
  versionMotor: varchar("version_motor", { length: 20 }),
  fuente: varchar("fuente", { length: 120 }).notNull(),
  generadoEn: timestamp("generado_en").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.celdaI, t.celdaJ] })]);

export const viasRegionTable = mysqlTable("vias_region", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  osmId: bigint("osm_id", { mode: "number" }).notNull(),
  tipo: varchar("tipo", { length: 40 }).notNull(),
  nombre: varchar("nombre", { length: 200 }),
  geom: geometria("geom").notNull(),
});

export const edificacionesRegionTable = mysqlTable("edificaciones_region", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  osmId: bigint("osm_id", { mode: "number" }).notNull(),
  geom: geometria("geom").notNull(),
});

export const aguaRegionTable = mysqlTable("agua_region", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  osmId: bigint("osm_id", { mode: "number" }).notNull(),
  tipo: varchar("tipo", { length: 20 }).notNull(),
  geom: geometria("geom").notNull(),
});

export const coberturaRegionTable = mysqlTable("cobertura_region", {
  id: int("id").primaryKey().autoincrement(),
  clave: varchar("clave", { length: 40 }).notNull(),
  xll: double("xll").notNull(),
  yll: double("yll").notNull(),
  cellsize: double("cellsize").notNull(),
  nrows: int("nrows").notNull(),
  ncols: int("ncols").notNull(),
  anio: smallint("anio").notNull(),
  fuente: varchar("fuente", { length: 120 }).notNull(),
  datos: blob("datos").notNull(),
});

export const elevacionRegionTable = mysqlTable("elevacion_region", {
  i: int("i").notNull(),
  j: int("j").notNull(),
  elevacionM: smallint("elevacion_m").notNull(),
}, (t) => [primaryKey({ columns: [t.i, t.j] })]);

export const precalculoBloquesTable = mysqlTable("precalculo_bloques", {
  tipo: varchar("tipo", { length: 20 }).notNull(),
  clave: varchar("clave", { length: 60 }).notNull(),
  estado: mysqlEnum("estado", ["pendiente", "listo", "error"]).notNull().default("pendiente"),
  intentos: int("intentos").notNull().default(0),
  detalle: varchar("detalle", { length: 300 }),
  actualizadoEn: timestamp("actualizado_en").notNull().defaultNow().onUpdateNow(),
}, (t) => [primaryKey({ columns: [t.tipo, t.clave] })]);
