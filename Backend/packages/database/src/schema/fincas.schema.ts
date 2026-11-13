/**
 * Tabla fincas (Drizzle ORM - MySQL 8).
 * Debe coincidir con Docs/ddl.sql y Docs/migraciones (001, 002 y 004).
 */
import { boolean, double, int, json, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import type { PoligonoGeoJson } from "@agrocore/contracts";

export const fincasTable = mysqlTable("fincas", {
  id: int("id").autoincrement().primaryKey(),
  nombre: varchar("nombre", { length: 120 }).notNull().unique(),
  descripcion: text("descripcion"),
  latitud: double("latitud").notNull(),
  longitud: double("longitud").notNull(),
  altitudM: int("altitud_m"),
  /** Polígono GeoJSON del lote (null si la finca es solo un punto). */
  areaGeojson: json("area_geojson").$type<PoligonoGeoJson | null>(),
  /** Vereda, aldea, condado o paraje (antes "vereda"). */
  localidad: varchar("localidad", { length: 80 }),
  pais: varchar("pais", { length: 80 }),
  region: varchar("region", { length: 80 }),
  tieneRiego: boolean("tiene_riego").notNull().default(false),
  /** Clave del catálogo de cultivos (ver database/src/catalogos). */
  cultivoActual: varchar("cultivo_actual", { length: 40 }),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

export type FincaRow = typeof fincasTable.$inferSelect;
export type NuevoFincaRow = typeof fincasTable.$inferInsert;
