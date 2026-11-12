/**
 * Pool de MySQL 8 (mysql2/promise) + instancia de Drizzle ORM.
 */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema/index.ts";

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function createDatabase(config: DatabaseConfig) {
  const pool = mysql.createPool({ ...config, connectionLimit: 10 });
  return drizzle(pool, { schema, mode: "default" });
}

export type Database = ReturnType<typeof createDatabase>;
