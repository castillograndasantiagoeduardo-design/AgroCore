/**
 * DatoConFuente: toda cifra que ve el usuario (resultado, detalle, ticket y respuestas MCP) viaja con su origen.
 *
 *   valor   el número (o texto corto); null = no hay dato ("Sin datos de [fuente]"), nunca un valor de respaldo.
 *   unidad  "mm", "°C", "m", "%", "ha", "días", "I$/ha"...
 *   fuente  de dónde sale (ver FUENTES_DATO).
 *   tipo    medido      = lo midió un sensor o una base pública (NASA POWER, MODIS, SRTM, SoilGrids, OSM, IDEAM, EVA)
 *           calculado   = fórmula sobre datos medidos (ET0 de Hargreaves, déficit, pendiente)
 *           estimado    = aproximación declarada (climatología mensual en vez de serie diaria, altitud de la celda)
 *           referencia  = valor de tabla de referencia (FAO ECOCROP, FAOSTAT) o criterio documentado del sistema
 *   fecha   periodo o fecha del dato ("1996-2025", "2018-2022", "2026-11-13").
 *   nota    aclaración en lenguaje sencillo ("aproximado: la celda de NASA mide unos 55 km").
 */
import { z } from "zod";

export const FUENTES_DATO = [
  "NASA_POWER",
  "MODIS_NDVI",
  "MODIS_COBERTURA",
  "SRTM",
  "SOILGRIDS",
  "OSM",
  "IDEAM",
  "FAO_ECOCROP",
  "FAOSTAT",
  "EVA",
  "LITERATURA",
  "USUARIO",
  "CALCULO",
] as const;
export const FuenteDatoSchema = z.enum(FUENTES_DATO);
export type FuenteDato = z.infer<typeof FuenteDatoSchema>;

/** Nombre para mostrar de cada fuente (lenguaje sencillo). */
export const NOMBRE_FUENTE: Record<FuenteDato, string> = {
  NASA_POWER: "NASA POWER",
  MODIS_NDVI: "Satélite MODIS (vegetación)",
  MODIS_COBERTURA: "Satélite MODIS (uso del suelo)",
  SRTM: "Elevación SRTM",
  SOILGRIDS: "ISRIC SoilGrids",
  OSM: "OpenStreetMap",
  IDEAM: "IDEAM",
  FAO_ECOCROP: "FAO ECOCROP",
  FAOSTAT: "FAOSTAT",
  EVA: "Evaluaciones Agropecuarias Municipales (EVA)",
  LITERATURA: "Literatura técnica",
  USUARIO: "Dato del agricultor",
  CALCULO: "Cálculo de AgroCore",
};

export const TIPOS_DATO = ["medido", "calculado", "estimado", "referencia"] as const;
export const TipoDatoSchema = z.enum(TIPOS_DATO);
export type TipoDato = z.infer<typeof TipoDatoSchema>;

/** Esquema de un DatoConFuente cuyo valor cumple `valor` (o es null cuando no hay dato). */
export function datoConFuente<T extends z.ZodTypeAny>(valor: T) {
  return z.object({
    valor: valor.nullable(),
    unidad: z.string().optional(),
    fuente: FuenteDatoSchema,
    tipo: TipoDatoSchema,
    fecha: z.string().optional(),
    nota: z.string().optional(),
  });
}

export const DatoNumericoSchema = datoConFuente(z.number());
export type DatoNumerico = z.infer<typeof DatoNumericoSchema>;
export const DatoTextoSchema = datoConFuente(z.string());
export type DatoTexto = z.infer<typeof DatoTextoSchema>;

/** Forma genérica en TypeScript (el valor null significa "Sin datos de [fuente]"). */
export interface DatoConFuente<T> {
  valor: T | null;
  unidad?: string;
  fuente: FuenteDato;
  tipo: TipoDato;
  fecha?: string;
  nota?: string;
}

/** Texto estándar cuando falta un dato. */
export function textoSinDatos(fuente: FuenteDato): string {
  return "Sin datos de " + NOMBRE_FUENTE[fuente];
}
