/**
 * Contratos del módulo rotaciones: entrada (finca + prioridades del agricultor) y salida
 * (3 estrategias de 2 años comparadas con evidencia, beneficios, vacíos y riesgos).
 *
 * El motor SUGIERE Y EXPLICA; no reemplaza el criterio del agricultor ni del agrónomo.
 */
import { z } from "zod";
import { AptitudClimaSchema, ClaveCultivoSchema, FamiliaBotanicaSchema } from "./cultivos.schema.ts";
import { ClasificacionClimaticaSchema } from "./clima.schema.ts";

// ---------------------------------------------------------------------------
// Vocabulario
// ---------------------------------------------------------------------------

/** Lo que el agricultor puede priorizar. Cada estrategia recibe un puntaje 0–100 por cada una. */
export const PRIORIDADES_ROTACION = ["agua", "suelo", "plagas", "forraje", "ingreso"] as const;
export type PrioridadRotacion = (typeof PRIORIDADES_ROTACION)[number];

export const IDS_ESTRATEGIA = ["A", "B", "C"] as const;
export const IdEstrategiaSchema = z.enum(IDS_ESTRATEGIA);
export type IdEstrategia = z.infer<typeof IdEstrategiaSchema>;

/** A = lo que hace hoy la finca · B = la mejor para el suelo · C = la mejor para lechería/forraje. */
export const ENFOQUES_ESTRATEGIA = ["actual", "suelo", "forraje"] as const;
export const EnfoqueEstrategiaSchema = z.enum(ENFOQUES_ESTRATEGIA);
export type EnfoqueEstrategia = z.infer<typeof EnfoqueEstrategiaSchema>;

/** Reglas agronómicas que el motor evalúa en cada estrategia. */
export const REGLAS_ROTACION = [
  "no_repetir_familia", // no sembrar la misma familia botánica dos semestres seguidos
  "leguminosa_cada_dos_anios", // al menos un cultivo que fije nitrógeno en los 4 semestres
  "siembra_inicio_lluvias", // las siembras caen en las ventanas de inicio de lluvias
  "evitar_helada", // el ciclo no cruza meses de helada si el cultivo no la tolera
  "temperatura_apta", // la temperatura media del ciclo está en el rango del cultivo (FAO ECOCROP)
  "agua_suficiente", // la lluvia del ciclo (o el riego) cubre el mínimo del cultivo
  "ciclo_cabe_en_ventana", // el cultivo se cosecha antes de la siguiente siembra
] as const;
export const ReglaRotacionSchema = z.enum(REGLAS_ROTACION);
export type ReglaRotacion = z.infer<typeof ReglaRotacionSchema>;

/**
 * ninguno = el ciclo no toca meses de helada · tolerado = los toca pero el cultivo tiene tolerancia alta ·
 * moderado = tolerancia media (cuidado en floración) · alto = tolerancia baja (no recomendado).
 */
export const RIESGOS_HELADA = ["ninguno", "tolerado", "moderado", "alto"] as const;
export const RiesgoHeladaSchema = z.enum(RIESGOS_HELADA);
export type RiesgoHelada = z.infer<typeof RiesgoHeladaSchema>;

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

/** Cuerpo del POST /api/rotaciones/fincas/:fincaId/comparar (el fincaId va en la URL). */
export const CompararRotacionesBodySchema = z.object({
  prioridades: PrioridadesRotacionSchema.default({}),
  /**
   * Opcional: lo que la finca siembra HOY, semestre a semestre (1 a 4 claves del catálogo).
   * Si se omite, la estrategia A asume que se repite `cultivoActual` de la finca.
   * Si tiene menos de 4, se repite en ciclo: ["papa","arveja"] → papa, arveja, papa, arveja.
   */
  secuenciaActual: z.array(ClaveCultivoSchema).min(1).max(4).optional(),
});

/** Entrada completa del caso de uso y de la tool MCP. */
export const CompararRotacionesSchema = CompararRotacionesBodySchema.extend({
  fincaId: z.coerce.number().int().min(1),
});
export type CompararRotacionesInput = z.infer<typeof CompararRotacionesSchema>;

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

const MesSchema = z.number().int().min(1).max(12);
const PuntajeSchema = z.number().min(0).max(100);

/** Un semestre de la rotación: qué se siembra, cuándo y con qué riesgos. */
export const PasoRotacionSchema = z.object({
  /** 1 y 2 = año 1 · 3 y 4 = año 2. Impares: siembra del primer semestre; pares: del segundo. */
  semestre: z.number().int().min(1).max(4),
  anio: z.number().int().min(1).max(2),
  cultivoClave: z.string(),
  cultivoNombre: z.string(),
  familias: z.array(FamiliaBotanicaSchema),
  /** true = es la misma pradera perenne del semestre anterior (no se vuelve a sembrar). */
  continuaPradera: z.boolean(),
  mesSiembra: MesSchema,
  /** Mes estimado de cosecha / primer corte, con el ciclo medio del cultivo. */
  mesCosecha: MesSchema,
  /** Meses calendario que ocupa el ciclo (en orden), ej. [10, 11, 12, 1, 2]. */
  mesesCiclo: z.array(MesSchema),
  /** Lluvia promedio que cae durante el ciclo (mm) según el perfil climático. */
  lluviaCicloMm: z.number(),
  /** Agua que falta para el mínimo del cultivo (0 si alcanza). */
  deficitAguaMm: z.number(),
  /** true si hay déficit y por eso el cultivo depende del riego. */
  requiereRiego: z.boolean(),
  /** Temperatura media de los meses del ciclo (°C) y aptitud del cultivo a esa temperatura. */
  tempMediaCicloC: z.number(),
  aptitudClima: AptitudClimaSchema,
  /** Meses del ciclo que son de riesgo de helada. */
  mesesHeladaEnCiclo: z.array(MesSchema),
  riesgoHelada: RiesgoHeladaSchema,
  /** Observaciones del semestre (ej. "se cosecha después de la siguiente siembra"). */
  notas: z.array(z.string()),
});
export type PasoRotacionDto = z.infer<typeof PasoRotacionSchema>;

export const EvaluacionReglaSchema = z.object({
  regla: ReglaRotacionSchema,
  cumple: z.boolean(),
  /** Explicación corta de por qué cumple o no, con los semestres afectados. */
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

export const EstrategiaRotacionSchema = z.object({
  id: IdEstrategiaSchema,
  enfoque: EnfoqueEstrategiaSchema,
  nombre: z.string(),
  secuencia: z.array(PasoRotacionSchema).length(4),
  /** Por qué se sugiere (o, en la A, qué se está evaluando). */
  porQue: z.string(),
  /** Datos concretos que se usaron: altitud, lluvia del ciclo, meses de helada, fuentes. */
  evidencia: z.array(z.string()),
  beneficios: z.array(z.string()),
  /** Lo que el sistema NO sabe (historial del lote, precios, análisis de suelo, pendiente...). */
  vaciosInformacion: z.array(z.string()),
  /** Riesgos para revisar con un agrónomo antes de decidir. */
  riesgos: z.array(z.string()),
  reglas: z.array(EvaluacionReglaSchema),
  /** Puntaje 0–100 por prioridad (independiente de los pesos). */
  puntajes: PuntajesRotacionSchema,
  /** Promedio de los puntajes ponderado con los pesos del agricultor (0–100). */
  puntajeTotal: PuntajeSchema,
});
export type EstrategiaRotacionDto = z.infer<typeof EstrategiaRotacionSchema>;

export const VentanaSiembraSchema = z.object({
  /** 1 = primer semestre del año · 2 = segundo semestre. */
  semestreDelAnio: z.number().int().min(1).max(2),
  mesSiembra: MesSchema,
  nombreMes: z.string(),
  /** false si ningún mes candidato es lluvioso según el perfil y se usó el mes por defecto. */
  coincideConLluvias: z.boolean(),
});
export type VentanaSiembraDto = z.infer<typeof VentanaSiembraSchema>;

export const ComparacionRotacionesSchema = z.object({
  finca: z.object({
    id: z.number().int(),
    nombre: z.string(),
    /** Altitud usada para filtrar cultivos (la de la finca o, si no se conoce, la del perfil climático). */
    altitudReferenciaM: z.number(),
    altitudConocida: z.boolean(),
    clasificacionClimatica: ClasificacionClimaticaSchema,
    tieneRiego: z.boolean(),
    cultivoActual: z.string().nullable(),
  }),
  prioridades: PrioridadesRotacionSchema,
  clima: z.object({
    fuente: z.string(),
    calibrado: z.boolean(),
    lluviaAnualMm: z.number(),
    mesesLluviosos: z.array(MesSchema),
    mesesRiesgoHelada: z.array(MesSchema),
  }),
  ventanasSiembra: z.array(VentanaSiembraSchema).length(2),
  /** Siempre 3, en orden A, B, C. */
  estrategias: z.array(EstrategiaRotacionSchema).length(3),
  /** La de mayor puntajeTotal con las prioridades enviadas (empate: B, luego C, luego A). */
  estrategiaMejorPuntuada: IdEstrategiaSchema,
  advertencias: z.array(z.string()),
  /** Recordatorio fijo: es una sugerencia con datos, no una recomendación técnica definitiva. */
  aviso: z.string(),
});
export type ComparacionRotacionesDto = z.infer<typeof ComparacionRotacionesSchema>;
