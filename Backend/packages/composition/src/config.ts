/**
 * Configuración del contenedor leída del entorno (Fail-Fast).
 */
import type { DatabaseConfig } from "@agrocore/database";

export interface AppConfig {
  db: DatabaseConfig;
}

function requireEnv(key: string): string {
  const value = Deno.env.get(key);
  if (!value) throw new Error("[CONFIG] Variable de entorno requerida no encontrada: " + key);
  return value;
}

export function loadConfigFromEnv(): AppConfig {
  return {
    db: {
      host: requireEnv("DB_HOST"),
      port: Number(requireEnv("DB_PORT")),
      user: requireEnv("DB_USER"),
      password: Deno.env.get("DB_PASSWORD") ?? "",
      database: requireEnv("DB_NAME"),
    },
  };
}
