/**
 * Contratos de la recomendación por época del año (v2).
 *
 * Flujo en dos etapas:
 *   POST /api/recomendacion/rapida   aptitud + clima resumido + épocas + qué sembrar en cada época para los 4 objetivos
 *   POST /api/recomendacion/detalle  suelo, vegetación, elevación, clima mes a mes, 3+ estrategias de rotación, vulnerabilidad
 *   POST /api/recomendacion/flujo    las dos en una respuesta NDJSON con el avance de cada fuente (pantalla de carga)
 *
 * Toda cifra viaja como DatoConFuente (dato.schema.ts). Los números estructurales (mes, orden, año, índice) no son datos.
 */
import { z } from "zod";
import { AreaSeleccionadaSchema, UbicacionResueltaSchema } from "./geo.schema.ts";
import { AptitudTerrenoSchema, TexturaSueloSchema } from "./terreno.schema.ts";
import { ClaveCultivoSchema } from "./cultivos.schema.ts";
import { MesVulnerabilidadSchema } from "./clima.schema.ts";
import { IdEstrategiaSchema, NivelRiesgoSchema } from "./rotaciones.schema.ts";
import { DatoNumericoSchema, DatoTextoSchema, FuenteDatoSchema } from "./dato.schema.ts";

// ─────────────────────────────── Objetivos ───────────────────────────────

export const OBJETIVOS = ["equilibrado", "mejorar_suelo", "ahorrar_agua", "mas_ingreso"] as const;
export const ObjetivoSchema = z.enum(OBJETIVOS);
export type Objetivo = z.infer<typeof ObjetivoSchema>;

export const NOMBRE_OBJETIVO: Record<Objetivo, string> = {
  equilibrado: "Equilibrado",
  mejorar_suelo: "Mejorar el suelo",
  ahorrar_agua: "Ahorrar agua",
  mas_ingreso: "Más ingreso",
};

/**
 * Perfiles FIJOS de cada objetivo (pesos de 1 a 5). Son un criterio del sistema, no un dato:
 * se documentan en Backend/packages/core/src/modules/recomendacion/MODULE.md.
 */
export const PESOS_OBJETIVO: Record<Objetivo, { agua: number; suelo: number; plagas: number; forraje: number; ingreso: number }> = {
  equilibrado: { agua: 3, suelo: 3, plagas: 3, forraje: 3, ingreso: 3 },
  mejorar_suelo: { agua: 2, suelo: 5, plagas: 4, forraje: 2, ingreso: 2 },
  ahorrar_agua: { agua: 5, suelo: 3, plagas: 2, forraje: 2, ingreso: 2 },
  mas_ingreso: { agua: 2, suelo: 2, plagas: 3, forraje: 2, ingreso: 5 },
};

// ─────────────────────────────── Entrada ───────────────────────────────

export const RecomendacionInputSchema = z.object({
  area: AreaSeleccionadaSchema,
  /** Cultivo que hay hoy en el lote (opcional). Si no se indica, la estrategia "actual" no se calcula. */
  cultivoActual: ClaveCultivoSchema.optional(),
  tieneRiego: z.boolean().default(false),
  /** Solo decide el orden de la respuesta MCP y el ticket: la etapa rápida calcula los 4 objetivos. */
  objetivo: ObjetivoSchema.default("equilibrado"),
});
export type RecomendacionInput = z.infer<typeof RecomendacionInputSchema>;

// ─────────────────────────────── Épocas ───────────────────────────────

export const TIPOS_EPOCA = ["lluviosa", "seca", "heladas", "calor", "invierno", "templada"] as const;
export const TipoEpocaSchema = z.enum(TIPOS_EPOCA);
export type TipoEpoca = z.infer<typeof TipoEpocaSchema>;

export const EpocaSchema = z.object({
  id: z.string(),
  tipo: TipoEpocaSchema,
  /** "Lluvias de marzo a mayo". */
  nombre: z.string(),
  meses: z.array(z.number().int().min(1).max(12)).min(1),
  /** "Llueve bien y no hay heladas". */
  queOcurre: z.string(),
  datos: z.object({
    lluviaMm: DatoNumericoSchema,
    etoMm: DatoNumericoSchema,
    tempMediaC: DatoNumericoSchema,
    tempMinC: DatoNumericoSchema,
    diasHelada: DatoNumericoSchema,
    diasCalor: DatoNumericoSchema,
  }),
});
export type EpocaDto = z.infer<typeof EpocaSchema>;

// ─────────────────────────────── Presencia local ───────────────────────────────

/** local = se siembra en la zona (EVA o FAOSTAT) · poco_comun = no aparece · sin_datos = la fuente no cubre este cultivo o no respondió. */
export const PRESENCIAS_LOCALES = ["local", "poco_comun", "sin_datos"] as const;
export const PresenciaLocalNivelSchema = z.enum(PRESENCIAS_LOCALES);
export type PresenciaLocalNivel = z.infer<typeof PresenciaLocalNivelSchema>;

export const ADVERTENCIA_POCO_COMUN = "Poco sembrado en su zona: confirme que tiene comprador antes de sembrar";

export const PresenciaLocalSchema = z.object({
  fuente: FuenteDatoSchema,
  /** "Duitama y 8 municipios a menos de 25 km" o "Kenia". */
  ambito: z.string(),
  periodo: z.string(),
  disponible: z.boolean(),
  /** Área sembrada por cultivo del catálogo en la zona (DatoConFuente en hectáreas). */
  cultivos: z.array(z.object({ clave: z.string(), nombre: z.string(), areaHa: DatoNumericoSchema })),
  nota: z.string().optional(),
});
export type PresenciaLocalDto = z.infer<typeof PresenciaLocalSchema>;

// ─────────────────────────────── Recomendación por época ───────────────────────────────

export const CultivoSugeridoSchema = z.object({
  clave: z.string(),
  nombre: z.string(),
  presenciaLocal: PresenciaLocalNivelSchema,
  /** Presente si el cultivo es poco común en la zona o no hay datos de presencia. */
  advertencia: z.string().optional(),
  puntaje: DatoNumericoSchema,
});
export type CultivoSugeridoDto = z.infer<typeof CultivoSugeridoSchema>;

export const ACCIONES_EPOCA = ["sembrar", "descansar"] as const;

export const RecomendacionEpocaSchema = z.object({
  epocaId: z.string(),
  accion: z.enum(ACCIONES_EPOCA),
  /** Mejor cultivo de la época (null si conviene descansar). */
  cultivo: CultivoSugeridoSchema.nullable(),
  alternativa: CultivoSugeridoSchema.nullable(),
  /** "Dejar descansar con cobertura" o "Sembrar arveja". */
  queSembrar: z.string(),
  /** Una frase con datos calculados (las cifras salen de `datos`). */
  porQue: z.string(),
  /** Cuidado principal (una frase). */
  cuidado: z.string(),
  datos: z.array(DatoNumericoSchema),
  fuentes: z.array(FuenteDatoSchema),
});
export type RecomendacionEpocaDto = z.infer<typeof RecomendacionEpocaSchema>;

export const RecomendacionesPorObjetivoSchema = z.object({
  equilibrado: z.array(RecomendacionEpocaSchema),
  mejorar_suelo: z.array(RecomendacionEpocaSchema),
  ahorrar_agua: z.array(RecomendacionEpocaSchema),
  mas_ingreso: z.array(RecomendacionEpocaSchema),
});
export type RecomendacionesPorObjetivoDto = z.infer<typeof RecomendacionesPorObjetivoSchema>;

// ─────────────────────────────── Pasos de carga ───────────────────────────────

export const PASOS_CARGA = ["vias", "clima", "vegetacion", "suelo", "recomendacion"] as const;
export const PasoCargaIdSchema = z.enum(PASOS_CARGA);
export type PasoCargaId = z.infer<typeof PasoCargaIdSchema>;

export const NOMBRE_PASO_CARGA: Record<PasoCargaId, string> = {
  vias: "Revisando si hay vías o construcciones",
  clima: "Consultando 30 años de clima de la NASA",
  vegetacion: "Mirando la vegetación con satélite",
  suelo: "Analizando el suelo",
  recomendacion: "Buscando qué sembrar en cada época",
};

export const ESTADOS_PASO = ["pendiente", "listo", "no_disponible"] as const;
export const PasoCargaSchema = z.object({
  id: PasoCargaIdSchema,
  nombre: z.string(),
  estado: z.enum(ESTADOS_PASO),
  detalle: z.string().optional(),
});
export type PasoCargaDto = z.infer<typeof PasoCargaSchema>;

// ─────────────────────────────── Etapa rápida ───────────────────────────────

export const ORIGENES_RESULTADO = ["precalculo", "cache", "en_vivo"] as const;

/** Vía cercana detectada (OpenStreetMap): geometría para dibujarla y distancias como DatoConFuente. */
export const ViaCercanaSchema = z.object({
  tipo: z.string(),
  nombre: z.string().nullable(),
  distanciaM: DatoNumericoSchema,
  semiAnchoM: DatoNumericoSchema,
  /** [lat, lon] para resaltarla en el mapa (geometría, no es un dato que se muestre). */
  geometria: z.array(z.tuple([z.number(), z.number()])),
});
export type ViaCercanaDto = z.infer<typeof ViaCercanaSchema>;

export const AptitudRapidaSchema = z.object({
  estado: AptitudTerrenoSchema,
  mensaje: z.string(),
  /** false = no se pudo consultar OpenStreetMap: la aptitud no verificó vías. */
  viasVerificadas: z.boolean(),
  viasCercanas: z.array(ViaCercanaSchema),
  fuentes: z.array(FuenteDatoSchema),
});
export type AptitudRapidaDto = z.infer<typeof AptitudRapidaSchema>;

export const RecomendacionRapidaSchema = z.object({
  ubicacion: UbicacionResueltaSchema,
  aptitud: AptitudRapidaSchema,
  resumenClima: z.object({
    lluviaAnualMm: DatoNumericoSchema,
    tempMediaC: DatoNumericoSchema,
    altitudM: DatoNumericoSchema,
    /** serie_diaria = 30 años día a día · climatologia = promedios mensuales (aproximado, se usa en frío). */
    origen: z.enum(["serie_diaria", "climatologia"]),
  }),
  epocas: z.array(EpocaSchema),
  recomendaciones: RecomendacionesPorObjetivoSchema,
  presenciaLocal: PresenciaLocalSchema.nullable(),
  pasos: z.array(PasoCargaSchema),
  origen: z.enum(ORIGENES_RESULTADO),
  versionMotor: z.string(),
  generadoEn: z.string(),
  advertencias: z.array(z.string()),
  vaciosInformacion: z.array(z.string()),
  aviso: z.string(),
});
export type RecomendacionRapidaDto = z.infer<typeof RecomendacionRapidaSchema>;

// ─────────────────────────────── Etapa de detalle ───────────────────────────────

export const ClimaMesDetalleSchema = z.object({
  mes: z.number().int().min(1).max(12),
  lluviaMm: DatoNumericoSchema,
  etoMm: DatoNumericoSchema,
  tempMediaC: DatoNumericoSchema,
  tempMinC: DatoNumericoSchema,
  tempMaxC: DatoNumericoSchema,
  diasHelada: DatoNumericoSchema,
  diasCalor: DatoNumericoSchema,
});
export type ClimaMesDetalleDto = z.infer<typeof ClimaMesDetalleSchema>;

export const PasoEstrategiaDetalleSchema = z.object({
  orden: z.number().int(),
  anio: z.number().int(),
  cultivoClave: z.string(),
  cultivoNombre: z.string(),
  continua: z.boolean(),
  mesSiembra: z.number().int().min(1).max(12),
  mesCosecha: z.number().int().min(1).max(12),
  mesesCiclo: z.array(z.number().int().min(1).max(12)),
  presenciaLocal: PresenciaLocalNivelSchema,
  tempMediaCicloC: DatoNumericoSchema,
  lluviaCicloMm: DatoNumericoSchema,
  deficitAguaMm: DatoNumericoSchema,
  riesgoHelada: NivelRiesgoSchema,
  riesgoCalor: NivelRiesgoSchema,
  notas: z.array(z.string()),
});

export const EstrategiaDetalleSchema = z.object({
  id: IdEstrategiaSchema,
  nombre: z.string(),
  secuencia: z.array(PasoEstrategiaDetalleSchema),
  porQue: z.string(),
  evidencia: z.array(z.object({ texto: z.string(), fuente: FuenteDatoSchema })),
  beneficios: z.array(z.string()),
  vaciosInformacion: z.array(z.string()),
  riesgos: z.array(z.string()),
  puntajes: z.object({
    agua: DatoNumericoSchema,
    suelo: DatoNumericoSchema,
    plagas: DatoNumericoSchema,
    forraje: DatoNumericoSchema,
    ingreso: DatoNumericoSchema,
  }),
  puntajeTotal: DatoNumericoSchema,
});
export type EstrategiaDetalleDto = z.infer<typeof EstrategiaDetalleSchema>;

export const RecomendacionDetalleSchema = z.object({
  ubicacion: UbicacionResueltaSchema,
  terreno: z.object({
    aptitud: AptitudTerrenoSchema,
    mensajeAptitud: z.string(),
    elevacionM: DatoNumericoSchema,
    pendientePct: DatoNumericoSchema,
    excluidoPct: DatoNumericoSchema,
    suelo: z.object({
      ph: DatoNumericoSchema,
      arenaPct: DatoNumericoSchema,
      arcillaPct: DatoNumericoSchema,
      carbonoOrganicoGKg: DatoNumericoSchema,
      textura: DatoTextoSchema,
    }),
    cobertura: DatoTextoSchema,
    vegetacion: z.object({
      /** NDVI promedio de cada mes (12). */
      ndviMensual: z.array(z.object({ mes: z.number().int().min(1).max(12), ndvi: DatoNumericoSchema })),
      mesesBaldios: z.array(z.number().int().min(1).max(12)),
      explicacion: z.string(),
    }),
    textura: TexturaSueloSchema.nullable(),
  }),
  climaMensual: z.array(ClimaMesDetalleSchema),
  calendarioVulnerabilidad: z.array(MesVulnerabilidadSchema),
  estrategias: z.array(EstrategiaDetalleSchema),
  /** Si no se pudieron calcular estrategias (terreno no apto, sin temporadas...). */
  errorEstrategias: z.object({ code: z.string(), message: z.string() }).nullable(),
  pasos: z.array(PasoCargaSchema),
  fuentes: z.array(z.object({ fuente: FuenteDatoSchema, detalle: z.string() })),
  advertencias: z.array(z.string()),
  vaciosInformacion: z.array(z.string()),
  aviso: z.string(),
});
export type RecomendacionDetalleDto = z.infer<typeof RecomendacionDetalleSchema>;

// ─────────────────────────────── Flujo NDJSON ───────────────────────────────

export const EventoRecomendacionSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("paso"), paso: PasoCargaSchema }),
  /** Dato verdadero del lugar que ya llegó (para mostrar mientras espera). */
  z.object({ tipo: z.literal("dato"), etiqueta: z.string(), dato: DatoNumericoSchema }),
  z.object({ tipo: z.literal("rapida"), datos: RecomendacionRapidaSchema }),
  z.object({ tipo: z.literal("detalle"), datos: RecomendacionDetalleSchema }),
  z.object({ tipo: z.literal("error"), etapa: z.enum(["rapida", "detalle"]), error: z.object({ code: z.string(), message: z.string() }) }),
  z.object({ tipo: z.literal("fin") }),
]);
export type EventoRecomendacionDto = z.infer<typeof EventoRecomendacionSchema>;

/** Tiempo máximo de una petición: pasado este plazo se responde con lo que haya y advertencias. */
export const PLAZO_MAXIMO_PETICION_MS = 25_000;
