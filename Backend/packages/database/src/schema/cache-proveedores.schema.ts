/**
 * cache_proveedores: caché persistente de respuestas de proveedores externos.
 * Debe coincidir con Docs/ddl.sql y Docs/migraciones/005_cache_proveedores.sql.
 */
import { datetime, index, json, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

export const cacheProveedoresTable = mysqlTable("cache_proveedores", {
  clave: varchar("clave", { length: 191 }).primaryKey(),
  proveedor: varchar("proveedor", { length: 40 }).notNull(),
  valor: json("valor").notNull(),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
  expiraEn: datetime("expira_en").notNull(),
}, (t) => [index("idx_cache_proveedores_expira_en").on(t.expiraEn)]);
