/**
 * Contratos del módulo clima: forma de la petición y de la respuesta del perfil climático.
 */
import { z } from "zod";

export const PerfilClimaticoParamsSchema = z.object({
  fincaId: z.coerce.number().int().min(1),
});
export type PerfilClimaticoParams = z.infer<typeof PerfilClimaticoParamsSchema>;

export const TEMPORADAS = ["lluviosa", "seca"] as const;
export const TemporadaSchema = z.enum(TEMPORADAS);
export type Temporada = z.infer<typeof TemporadaSchema>;

/**
 * Clasificación climática genérica del sitio, DERIVADA del perfil (nadie la escribe a mano).
 * Ver core/clima/domain/services/clasificacion-climatica.service.ts para la regla.
 */
export const CLASIFICACIONES_CLIMATICAS = ["tropical", "subtropical", "templado", "frio", "de_altura"] as const;
export const ClasificacionClimaticaSchema = z.enum(CLASIFICACIONES_CLIMATICAS);
export type ClasificacionClimatica = z.infer<typeof ClasificacionClimaticaSchema>;

/** Resumen climático de un mes (promedio de todos los años del periodo). */
export const ClimaMensualSchema = z.object({
  mes: z.number().int().min(1).max(12),
  nombreMes: z.string(),
  /** Lluvia total promedio del mes (mm). */
  lluviaMm: z.number(),
  /** Temperaturas promedio del mes, YA corregidas a la altitud de la finca (°C). */
  tempMediaC: z.number(),
  tempMinC: z.number(),
  tempMaxC: z.number(),
  /** Promedio de días por año con temperatura mínima ≤ umbral de helada. */
  diasHeladaPromedio: z.number(),
  /** Fracción de años (0–1) en que el mes tuvo al menos un día de helada. */
  probabilidadHelada: z.number().min(0).max(1),
  /** Promedio de días por año con lluvia ≥ umbral de lluvia fuerte. */
  diasLluviaFuertePromedio: z.number(),
  temporada: TemporadaSchema,
});
export type ClimaMensualDto = z.infer<typeof ClimaMensualSchema>;

/** Corrección aplicada a NASA POWER en un mes, calculada contra la estación IDEAM. */
export const FactorCalibracionSchema = z.object({
  mes: z.number().int().min(1).max(12),
  /** °C que se suman a la temperatura mínima / media / máxima de NASA POWER. */
  deltaTminC: z.number(),
  deltaTmediaC: z.number(),
  deltaTmaxC: z.number(),
  /** Multiplicador de la lluvia de NASA POWER (0,5 = la NASA dobla la lluvia real). */
  factorLluvia: z.number(),
});
export type FactorCalibracionDto = z.infer<typeof FactorCalibracionSchema>;

export const CalibracionSchema = z.object({
  fuente: z.string(),
  estacion: z.string(),
  codigoEstacion: z.string(),
  municipioEstacion: z.string(),
  altitudEstacionM: z.number(),
  distanciaKm: z.number(),
  /** Periodo de la normal climatológica usada, ej. "1991-2020". */
  periodo: z.string(),
  factores: z.array(FactorCalibracionSchema).length(12),
});
export type CalibracionDto = z.infer<typeof CalibracionSchema>;

export const PerfilClimaticoSchema = z.object({
  /** null cuando el perfil se pidió para un punto del mapa sin finca guardada. */
  fincaId: z.number().int().nullable(),
  latitud: z.number(),
  longitud: z.number(),
  /** Altitud usada para la corrección (la de la finca o, si no se conoce, la de la celda). */
  altitudReferenciaM: z.number(),
  /** Altitud promedio de la celda del proveedor (NASA POWER). */
  altitudCeldaM: z.number(),
  /** Grados sumados a todas las temperaturas por la diferencia de altitud. */
  ajusteTemperaturaC: z.number(),
  periodo: z.object({ desde: z.string(), hasta: z.string(), anios: z.number().int() }),
  fuente: z.string(),
  /** null si no hay estación IDEAM cercana con normales completas (se usan datos NASA sin calibrar). */
  calibracion: CalibracionSchema.nullable(),
  umbrales: z.object({ heladaC: z.number(), lluviaFuerteMm: z.number() }),
  meses: z.array(ClimaMensualSchema).length(12),
  resumen: z.object({
    lluviaAnualMm: z.number(),
    tempMediaAnualC: z.number(),
    mesesLluviosos: z.array(z.number().int()),
    mesesSecos: z.array(z.number().int()),
    /** Meses con probabilidad de helada ≥ 25 %. */
    mesesRiesgoHelada: z.array(z.number().int()),
    clasificacionClimatica: ClasificacionClimaticaSchema,
  }),
  advertencias: z.array(z.string()),
});
export type PerfilClimaticoDto = z.infer<typeof PerfilClimaticoSchema>;
