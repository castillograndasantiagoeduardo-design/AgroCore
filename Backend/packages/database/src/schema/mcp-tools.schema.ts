/**
 * logs_mcp_tools: registro de cada herramienta MCP ejecutada.
 */
import { boolean, int, json, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const logsMcpToolsTable = mysqlTable("logs_mcp_tools", {
  id: int("id").autoincrement().primaryKey(),
  herramienta: varchar("herramienta", { length: 100 }).notNull(),
  /** Deprecado (Fase 0.5, sin login): queda nullable por los registros antiguos. */
  usuarioId: int("usuario_id"),
  /** Canal de la solicitud: api, mcp o script. */
  origen: varchar("origen", { length: 16 }).notNull().default("api"),
  argumentos: json("argumentos"),
  exito: boolean("exito").notNull(),
  error: text("error"),
  duracionMs: int("duracion_ms").notNull(),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});
