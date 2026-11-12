/**
 * logs_mcp_tools: registro de cada herramienta MCP ejecutada.
 */
import { boolean, int, json, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const logsMcpToolsTable = mysqlTable("logs_mcp_tools", {
  id: int("id").autoincrement().primaryKey(),
  herramienta: varchar("herramienta", { length: 100 }).notNull(),
  usuarioId: int("usuario_id").notNull(),
  argumentos: json("argumentos"),
  exito: boolean("exito").notNull(),
  error: text("error"),
  duracionMs: int("duracion_ms").notNull(),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
});
