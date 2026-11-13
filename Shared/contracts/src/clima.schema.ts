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
  /** Promedio de días por año con lluvia ≥ umbral de lluvia fuerte. */
  diasLluviaFuertePromedio: z.number(),
  /** Promedio de días por año con temperatura máxima ≥ umbral de calor (estrés térmico). */
  diasCalorPromedio: z.number(),
  /** Evapotranspiración de referencia del mes (mm), Hargreaves–Samani (FAO-56). */
  etoMm: z.number(),
  /** Lluvia − ET0 del mes (mm). Negativo = déficit de agua. */
  balanceHidricoMm: z.number(),
  temporada: TemporadaSchema,
});
export type ClimaMensualDto = z.infer<typeof ClimaMensualSchema>;

/** Régimen de lluvias del sitio. */
export const REGIMENES_LLUVIA = ["unimodal", "bimodal", "uniforme", "arido"] as const;
export const RegimenLluviasSchema = z.enum(REGIMENES_LLUVIA);
export type RegimenLluvias = z.infer<typeof RegimenLluviasSchema>;

/** Temporada de cultivo derivada del clima (no fija): meses seguidos aptos para sembrar. */
export const TemporadaCultivoSchema = z.object({
  inicioMes: z.number().int().min(1).max(12),
  meses: z.array(z.number().int().min(1).max(12)).min(1),
});
export type TemporadaCultivoDto = z.infer<typeof TemporadaCultivoSchema>;

export const TemporadasCultivoSchema = z.object({
  /** Temporadas sin riego (temperatura, helada y lluvia suficientes). */
  secano: z.array(TemporadaCultivoSchema),
  /** Temporadas con riego (solo temperatura y helada). */
  conRiego: z.array(TemporadaCultivoSchema),
  mesesAptosTermicos: z.array(z.number().int()),
  mesesAptosSecano: z.array(z.number().int()),
  /** Regla usada, en palabras. */
  regla: z.string(),
});
export type TemporadasCultivoDto = z.infer<typeof TemporadasCultivoSchema>;

export const TIPOS_AMENAZA = ["helada", "calor", "deficit_hidrico", "lluvia_extrema"] as const;
export const TipoAmenazaSchema = z.enum(TIPOS_AMENAZA);
export type TipoAmenaza = z.infer<typeof TipoAmenazaSchema>;

export const SEVERIDADES = ["baja", "media", "alta"] as const;
export const SeveridadAmenazaSchema = z.enum(SEVERIDADES);
export type SeveridadAmenaza = z.infer<typeof SeveridadAmenazaSchema>;

export const AmenazaClimaticaSchema = z.object({
  tipo: TipoAmenazaSchema,
  severidad: SeveridadAmenazaSchema,
  detalle: z.string(),
});
export type AmenazaClimaticaDto = z.infer<typeof AmenazaClimaticaSchema>;

/** Un mes del calendario de vulnerabilidad: qué amenaza hay y cómo de fuerte. */
export const MesVulnerabilidadSchema = z.object({
  mes: z.number().int().min(1).max(12),
  nombreMes: z.string(),
  amenazas: z.array(AmenazaClimaticaSchema),
  /** La amenaza más fuerte del mes, o null si no hay ninguna. */
  severidadMaxima: SeveridadAmenazaSchema.nullable(),
});
export type MesVulnerabilidadDto = z.infer<typeof MesVulnerabilidadSchema>;

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
  umbrales: z.object({ heladaC: z.number(), lluviaFuerteMm: z.number(), calorC: z.number() }),
  meses: z.array(ClimaMensualSchema).length(12),
  resumen: z.object({
    lluviaAnualMm: z.number(),
    tempMediaAnualC: z.number(),
    etoAnualMm: z.number(),
    /** Lluvia anual / ET0 anual (índice de aridez de la UNESCO: < 0,2 árido, < 0,5 semiárido, < 0,65 subhúmedo seco). */
    indiceAridez: z.number(),
    regimenLluvias: RegimenLluviasSchema,
    mesesLluviosos: z.array(z.number().int()),
    mesesSecos: z.array(z.number().int()),
    /** Meses con probabilidad de helada ≥ 25 %. */
    mesesRiesgoHelada: z.array(z.number().int()),
    /** Meses con estrés por calor (≥ 5 días con Tmáx ≥ umbral). */
    mesesCalor: z.array(z.number().int()),
    /** Meses con lluvia < 50 % de la ET0. */
    mesesDeficitHidrico: z.array(z.number().int()),
    /** Meses con ≥ 1,5 días de lluvia fuerte en promedio. */
    mesesLluviaExtrema: z.array(z.number().int()),
    clasificacionClimatica: ClasificacionClimaticaSchema,
  }),
  temporadasCultivo: TemporadasCultivoSchema,
  calendarioVulnerabilidad: z.array(MesVulnerabilidadSchema).length(12),
  advertencias: z.array(z.string()),
});
export type PerfilClimaticoDto = z.infer<typeof PerfilClimaticoSchema>;
