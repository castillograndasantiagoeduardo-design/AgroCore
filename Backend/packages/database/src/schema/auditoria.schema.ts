/**
 * logs_auditoria: tabla APPEND-ONLY (Regla 7). Triggers en Docs/ddl.sql bloquean UPDATE y DELETE.
 */
import { int, json, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

export const logsAuditoriaTable = mysqlTable("logs_auditoria", {
  id: int("id").autoincrement().primaryKey(),
  accion: varchar("accion", { length: 100 }).notNull(),
  entidad: varchar("entidad", { length: 100 }).notNull(),
  entidadId: varchar("entidad_id", { length: 64 }).notNull(),
  detalles: json("detalles").notNull(),
  /** Deprecado (Fase 0.5, sin login): queda nullable por los registros antiguos. */
  usuarioId: int("usuario_id"),
  /** Canal de la solicitud: api, mcp o script. */
  origen: varchar("origen", { length: 16 }).notNull().default("api"),
  ip: varchar("ip", { length: 64 }),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});
