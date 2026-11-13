/**
 * Configuración del contenedor leída del entorno (Fail-Fast en lo obligatorio).
 */
import type { DatabaseConfig } from "@agrocore/database";
import { parsearRegionPrecalculo, type RegionPrecalculo } from "@agrocore/platform";

export interface AppConfig {
  db: DatabaseConfig;
  /** Región precalculada (REGION_PRECALCULO). Dentro de "detalle" la etapa rápida se resuelve solo con MySQL. */
  regionPrecalculo: RegionPrecalculo;
  impresora: {
    /** Nombre con el que se compartió la térmica en Windows (IMPRESORA_COMPARTIDA, por defecto XP58). */
    compartida: string;
    /** n de ESC t n (IMPRESORA_CODEPAGE, por defecto 2 = PC850). */
    codepage: number;
    /** IMPRESORA_CORTADOR=true si la impresora tiene cortador. */
    cortar: boolean;
  };
}

function requireEnv(key: string): string {
  const value = Deno.env.get(key);
  if (!value) throw new Error("[CONFIG] Variable de entorno requerida no encontrada: " + key);
  return value;
}

export function loadConfigFromEnv(): AppConfig {
  const codepage = Number(Deno.env.get("IMPRESORA_CODEPAGE") ?? "2");
  return {
    db: {
      host: requireEnv("DB_HOST"),
      port: Number(requireEnv("DB_PORT")),
      user: requireEnv("DB_USER"),
      password: Deno.env.get("DB_PASSWORD") ?? "",
      database: requireEnv("DB_NAME"),
    },
    regionPrecalculo: parsearRegionPrecalculo(Deno.env.get("REGION_PRECALCULO")),
    impresora: {
      compartida: Deno.env.get("IMPRESORA_COMPARTIDA") || "XP58",
      codepage: Number.isInteger(codepage) && codepage >= 0 && codepage <= 255 ? codepage : 2,
      cortar: (Deno.env.get("IMPRESORA_CORTADOR") ?? "false").toLowerCase() === "true",
    },
  };
}
