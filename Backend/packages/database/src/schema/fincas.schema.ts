/**
 * Tabla fincas (Drizzle ORM - MySQL 8).
 * Debe coincidir con Docs/ddl.sql y Docs/migraciones (001 y 002).
 */
import { boolean, double, int, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const fincasTable = mysqlTable("fincas", {
  id: int("id").autoincrement().primaryKey(),
  nombre: varchar("nombre", { length: 120 }).notNull().unique(),
  descripcion: text("descripcion"),
  latitud: double("latitud").notNull(),
  longitud: double("longitud").notNull(),
  altitudM: int("altitud_m"),
  vereda: varchar("vereda", { length: 80 }),
  tieneRiego: boolean("tiene_riego").notNull().default(false),
  /** Clave del catálogo de cultivos (ver database/src/catalogos). */
  cultivoActual: varchar("cultivo_actual", { length: 40 }),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

export type FincaRow = typeof fincasTable.$inferSelect;
export type NuevoFincaRow = typeof fincasTable.$inferInsert;
