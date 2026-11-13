/**
 * Contratos del módulo rotaciones: entrada (sitio + cultivo actual + riego + prioridades) y salida
 * (≥ 3 estrategias de 2 años, en TEMPORADAS REALES del sitio, comparadas con evidencia, beneficios,
 * vacíos, riesgos, calendario de 12 meses y oportunidades).
 *
 * El motor SUGIERE Y EXPLICA; no reemplaza el criterio del agricultor ni del agrónomo.
 */
import { z } from "zod";
import { AptitudClimaSchema, ClaveCultivoSchema, FamiliaBotanicaSchema } from "./cultivos.schema.ts";
import {
  ClasificacionClimaticaSchema,
  MesVulnerabilidadSchema,
  RegimenLluviasSchema,
  TemporadaCultivoSchema,
} from "./clima.schema.ts";
import { AreaSeleccionadaSchema, UbicacionResueltaSchema } from "./geo.schema.ts";
import { AptitudTerrenoSchema, TexturaSueloSchema } from "./terreno.schema.ts";

// ---------------------------------------------------------------------------
// Vocabulario
// ---------------------------------------------------------------------------

/** Lo que el agricultor puede priorizar. Cada estrategia recibe un puntaje 0–100 por cada una. */
export const PRIORIDADES_ROTACION = ["agua", "suelo", "plagas", "forraje", "ingreso"] as const;
export type PrioridadRotacion = (typeof PRIORIDADES_ROTACION)[number];

export const IDS_ESTRATEGIA = ["A", "B", "C", "D"] as const;
export const IdEstrategiaSchema = z.enum(IDS_ESTRATEGIA);
export type IdEstrategia = z.infer<typeof IdEstrategiaSchema>;

/** A = lo que se siembra hoy · B = suelo · C = forraje / ingreso · D = agua (si la prioridad de agua ≥ 4 o hay déficit). */
export const ENFOQUES_ESTRATEGIA = ["actual", "suelo", "forraje", "agua"] as const;
export const EnfoqueEstrategiaSchema = z.enum(ENFOQUES_ESTRATEGIA);
export type EnfoqueEstrategia = z.infer<typeof EnfoqueEstrategiaSchema>;

/** Reglas agronómicas que el motor evalúa en cada estrategia. */
export const REGLAS_ROTACION = [
  "no_sembrar_en_carretera", // bloqueante: viene del módulo terreno
  "no_repetir_familia", // no sembrar la misma familia botánica en temporadas seguidas
  "leguminosa_cada_dos_anios", // al menos un cultivo que fije nitrógeno en los 2 años
  "siembra_en_temporada", // los cultivos se siembran en las temporadas derivadas del clima
  "temperatura_apta", // la temperatura media del ciclo está en el rango del cultivo (FAO ECOCROP)
  "evitar_helada", // el ciclo no cruza meses de helada si el cultivo no la tolera
  "tolerancia_calor", // el ciclo no cruza meses de calor si el cultivo no lo tolera
  "agua_suficiente", // la lluvia del ciclo (o el riego) cubre el mínimo del cultivo
  "ciclo_cabe_en_ventana", // el cultivo se cosecha antes de la siguiente siembra (o ocupa dos ventanas a propósito)
  "suelo_compatible", // pH y textura del suelo (si se conocen) dentro de lo que tolera el cultivo
  "cobertura_en_pendiente", // pendiente > 25 % ⇒ cobertura permanente o curvas de nivel
  "aprovechar_baldio", // si el NDVI muestra meses baldíos, cubrirlos con cultivo, cobertura o abono verde
] as const;
export const ReglaRotacionSchema = z.enum(REGLAS_ROTACION);
export type ReglaRotacion = z.infer<typeof ReglaRotacionSchema>;

/** ninguno · tolerado (lo toca pero el cultivo lo tolera) · moderado · alto (no recomendado). */
export const NIVELES_RIESGO = ["ninguno", "tolerado", "moderado", "alto"] as const;
export const NivelRiesgoSchema = z.enum(NIVELES_RIESGO);
export type NivelRiesgo = z.infer<typeof NivelRiesgoSchema>;
/** Compatibilidad con el nombre anterior. */
export const RiesgoHeladaSchema = NivelRiesgoSchema;
export type RiesgoHelada = NivelRiesgo;

export const TIPOS_VENTANA = ["temporada", "intervalo"] as const;
export const TipoVentanaSchema = z.enum(TIPOS_VENTANA);
export type TipoVentana = z.infer<typeof TipoVentanaSchema>;

/** Clave especial de un paso sin cultivo (descanso del lote). */
export const CLAVE_BARBECHO = "barbecho";

/** De dónde salió cada dato de la evidencia. */
export const FUENTES_EVIDENCIA = ["NASA POWER", "IDEAM", "MODIS", "SoilGrids", "SRTM", "OpenStreetMap", "ECOCROP", "Regla", "Agricultor"] as const;
export const FuenteEvidenciaSchema = z.enum(FUENTES_EVIDENCIA);
export type FuenteEvidencia = z.infer<typeof FuenteEvidenciaSchema>;

export const TIPOS_OPORTUNIDAD = [
  "baldio_cobertura",
  "temporada_vulnerable",
  "romper_ciclo_plagas",
  "menor_demanda_agua",
  "mejorar_infiltracion",
  "sumar_ingreso",
] as const;
export const TipoOportunidadSchema = z.enum(TIPOS_OPORTUNIDAD);
export type TipoOportunidad = z.infer<typeof TipoOportunidadSchema>;

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

const PesoSchema = z.number().int().min(0).max(5).default(3);

/** Pesos de 0 (no me importa) a 5 (es lo más importante). Lo que no se envía vale 3. */
export const PrioridadesRotacionSchema = z.object({
  agua: PesoSchema,
  suelo: PesoSchema,
  plagas: PesoSchema,
  forraje: PesoSchema,
  ingreso: PesoSchema,
});
export type PrioridadesRotacion = z.infer<typeof PrioridadesRotacionSchema>;

/**
 * Lo que el lote siembra HOY, temporada a temporada (1 a 4 claves del catálogo). Si tiene menos que
 * las temporadas de 2 años, se repite en ciclo: ["papa","arveja"] → papa, arveja, papa, arveja.
 */
const SecuenciaActualSchema = z.array(ClaveCultivoSchema).min(1).max(4);

/** POST /api/rotaciones/comparar: cualquier punto o área del mundo. */
export const CompararRotacionesUbicacionSchema = z.object({
  area: AreaSeleccionadaSchema,
  /** Clave del cultivo principal de hoy (opcional: sin él no hay estrategia A). */
  cultivoActual: ClaveCultivoSchema.optional(),
  secuenciaActual: SecuenciaActualSchema.optional(),
  tieneRiego: z.boolean().default(false),
  prioridades: PrioridadesRotacionSchema.default({}),
  /** Opcional: si el usuario conoce la altitud (si no, SRTM o la celda del clima). */
  altitudM: z.number().int().min(-500).max(6000).optional(),
});
export type CompararRotacionesUbicacionInput = z.infer<typeof CompararRotacionesUbicacionSchema>;

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

const MesSchema = z.number().int().min(1).max(12);
const PuntajeSchema = z.number().min(0).max(100);

/** Una ventana de siembra del año (se repite en el año 2). */
export const VentanaRotacionSchema = z.object({
  /** 1..n dentro del año. */
  indice: z.number().int().min(1),
  tipo: TipoVentanaSchema,
  /** Mes en que se siembra. */
  mesInicio: MesSchema,
  /** Meses disponibles desde esta siembra hasta la siguiente. */
  meses: z.array(MesSchema).min(1),
  /** Meses que de verdad son temporada de cultivo (en un intervalo: ninguno). */
  mesesTemporada: z.array(MesSchema),
  nombre: z.string(),
});
export type VentanaRotacionDto = z.infer<typeof VentanaRotacionSchema>;

/** Un paso de la rotación: qué se siembra en una ventana, cuándo y con qué riesgos. */
export const PasoRotacionSchema = z.object({
  /** 1..N en los 2 años. */
  orden: z.number().int().min(1),
  anio: z.number().int().min(1).max(2),
  tipoVentana: TipoVentanaSchema,
  /** Clave del catálogo o "barbecho". */
  cultivoClave: z.string(),
  cultivoNombre: z.string(),
  familias: z.array(FamiliaBotanicaSchema),
  /** true = el mismo cultivo del paso anterior sigue en el lote (pradera o cultivo de ciclo largo). */
  continua: z.boolean(),
  mesSiembra: MesSchema,
  mesCosecha: MesSchema,
  mesesCiclo: z.array(MesSchema),
  /** Temperatura media de los meses del ciclo (°C) y aptitud del cultivo a esa temperatura (null en barbecho). */
  tempMediaCicloC: z.number(),
  aptitudClima: AptitudClimaSchema.nullable(),
  /** Lluvia promedio que cae durante el ciclo (mm). */
  lluviaCicloMm: z.number(),
  /** Agua que falta para el mínimo del cultivo (0 si alcanza). */
  deficitAguaMm: z.number(),
  requiereRiego: z.boolean(),
  mesesHeladaEnCiclo: z.array(MesSchema),
  riesgoHelada: NivelRiesgoSchema,
  mesesCalorEnCiclo: z.array(MesSchema),
  riesgoCalor: NivelRiesgoSchema,
  notas: z.array(z.string()),
});
export type PasoRotacionDto = z.infer<typeof PasoRotacionSchema>;

export const EvaluacionReglaSchema = z.object({
  regla: ReglaRotacionSchema,
  cumple: z.boolean(),
  /** Explicación corta de por qué cumple o no, con las temporadas afectadas. */
  detalle: z.string(),
});
export type EvaluacionReglaDto = z.infer<typeof EvaluacionReglaSchema>;

export const PuntajesRotacionSchema = z.object({
  agua: PuntajeSchema,
  suelo: PuntajeSchema,
  plagas: PuntajeSchema,
  forraje: PuntajeSchema,
  ingreso: PuntajeSchema,
});
export type PuntajesRotacionDto = z.infer<typeof PuntajesRotacionSchema>;

/** Un dato concreto usado, con su fuente. */
export const EvidenciaSchema = z.object({ texto: z.string(), fuente: FuenteEvidenciaSchema });
export type EvidenciaDto = z.infer<typeof EvidenciaSchema>;

export const EstrategiaRotacionSchema = z.object({
  id: IdEstrategiaSchema,
  enfoque: EnfoqueEstrategiaSchema,
  nombre: z.string(),
  secuencia: z.array(PasoRotacionSchema).min(1),
  /** Por qué se sugiere (o, en la A, qué se está evaluando). */
  porQue: z.string().min(1),
  /** Datos concretos que se usaron, cada uno con su fuente. Solo datos calculados: no se inventan cifras. */
  evidencia: z.array(EvidenciaSchema).min(1),
  beneficios: z.array(z.string()).min(1),
  /** Lo que el sistema NO sabe (historial del lote, precios, análisis de suelo...). */
  vaciosInformacion: z.array(z.string()).min(1),
  /** Riesgos para revisar con un agrónomo local antes de decidir. */
  riesgos: z.array(z.string()).min(1),
  reglas: z.array(EvaluacionReglaSchema),
  /** Puntaje 0–100 por prioridad (independiente de los pesos). */
  puntajes: PuntajesRotacionSchema,
  /** Promedio de los puntajes ponderado con los pesos del agricultor (0–100). */
  puntajeTotal: PuntajeSchema,
});
export type EstrategiaRotacionDto = z.infer<typeof EstrategiaRotacionSchema>;

export const OportunidadSchema = z.object({
  tipo: TipoOportunidadSchema,
  meses: z.array(MesSchema),
  texto: z.string(),
  fuentes: z.array(FuenteEvidenciaSchema).min(1),
});
export type OportunidadDto = z.infer<typeof OportunidadSchema>;

/** Un mes del calendario del lote: baldío / vulnerable / oportunidad. */
export const MesCalendarioSchema = z.object({
  mes: MesSchema,
  nombreMes: z.string(),
  /** El NDVI muestra que el lote suele estar sin cultivo este mes. */
  baldio: z.boolean(),
  /** El mes cae en una temporada de cultivo del sitio. */
  enTemporada: z.boolean(),
  vulnerabilidad: MesVulnerabilidadSchema,
  /** Cultivos del plan ACTUAL (estrategia A, año 1) expuestos a una amenaza media o alta este mes. */
  cultivosExpuestos: z.array(z.string()),
  /** Hay al menos una oportunidad de rotación que toca este mes. */
  oportunidad: z.boolean(),
});
export type MesCalendarioDto = z.infer<typeof MesCalendarioSchema>;

export const ComparacionRotacionesSchema = z.object({
  sitio: z.object({
    tipo: z.enum(["ubicacion"]),
    nombre: z.string().nullable(),
    ubicacion: UbicacionResueltaSchema,
    /** Altitud usada (del usuario, de SRTM o de la celda del clima). */
    altitudReferenciaM: z.number(),
    fuenteAltitud: z.enum(["usuario", "srtm", "clima"]),
    tieneRiego: z.boolean(),
    /** null si no se indicó el cultivo actual (no hay estrategia A). */
    cultivoActual: z.string().nullable(),
    clasificacionClimatica: ClasificacionClimaticaSchema,
  }),
  terreno: z.object({
    aptitud: AptitudTerrenoSchema,
    mensajeAptitud: z.string(),
    excluidoPct: z.number(),
    pendientePct: z.number().nullable(),
    textura: TexturaSueloSchema.nullable(),
    ph: z.number().nullable(),
    mesesBaldios: z.array(MesSchema),
    fuentes: z.array(z.string()),
  }),
  prioridades: PrioridadesRotacionSchema,
  clima: z.object({
    fuente: z.string(),
    calibrado: z.boolean(),
    lluviaAnualMm: z.number(),
    etoAnualMm: z.number(),
    regimenLluvias: RegimenLluviasSchema,
    mesesLluviosos: z.array(MesSchema),
    mesesRiesgoHelada: z.array(MesSchema),
    mesesCalor: z.array(MesSchema),
    mesesDeficitHidrico: z.array(MesSchema),
  }),
  /** Temporadas de cultivo usadas (secano o, si hay riego, con riego). */
  temporadas: z.array(TemporadaCultivoSchema).min(1),
  /** Ventanas de un año (se repiten en el año 2). */
  ventanas: z.array(VentanaRotacionSchema).min(1),
  calendario: z.array(MesCalendarioSchema).length(12),
  /** 3 o 4, en orden A, B, C (y D si aplica), siempre distintas. */
  estrategias: z.array(EstrategiaRotacionSchema).min(3).max(4),
  /** La de mayor puntajeTotal con las prioridades enviadas (empate: B, C, D, A). */
  estrategiaMejorPuntuada: IdEstrategiaSchema,
  oportunidades: z.array(OportunidadSchema).min(1),
  advertencias: z.array(z.string()),
  /** Recordatorio fijo: es una sugerencia con datos, no una recomendación técnica definitiva. */
  aviso: z.string(),
});
export type ComparacionRotacionesDto = z.infer<typeof ComparacionRotacionesSchema>;
