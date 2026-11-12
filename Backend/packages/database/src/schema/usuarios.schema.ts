/**
 * Tabla usuarios (Drizzle ORM - MySQL 8).
 * Debe coincidir con Docs/ddl.sql y Docs/migraciones (003).
 */
import { boolean, int, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

export const usuariosTable = mysqlTable("usuarios", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 191 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  rol: varchar("rol", { length: 32 }).notNull().default("admin"),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});

export type UsuarioRow = typeof usuariosTable.$inferSelect;
export type NuevoUsuarioRow = typeof usuariosTable.$inferInsert;

