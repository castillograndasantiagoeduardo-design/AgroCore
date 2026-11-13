/**
 * Contratos del módulo terreno: análisis del sitio seleccionado (solo lectura).
 * Aptitud (carretera, edificación, agua, uso del suelo), elevación y pendiente, suelo, humedad del suelo,
 * NDVI (meses baldíos y estrés de vegetación) y cobertura MODIS, con fuentes y vacíos de información.
 */
import { z } from "zod";
import { AreaSeleccionadaSchema, UbicacionResueltaSchema } from "./geo.schema.ts";

export const APTITUDES_TERRENO = [
  "apto",
  "no_apto_carretera",
  "no_apto_edificacion",
  "no_apto_agua",
  "no_apto_uso_suelo",
] as const;
export const AptitudTerrenoSchema = z.enum(APTITUDES_TERRENO);
export type AptitudTerreno = z.infer<typeof AptitudTerrenoSchema>;

/** Mensaje exacto cuando el sitio cae sobre una vía. */
export const MENSAJE_ES_CARRETERA = "No se puede sembrar: es carretera";

export const TEXTURAS_SUELO = ["arenosa", "franca", "arcillosa"] as const;
export const TexturaSueloSchema = z.enum(TEXTURAS_SUELO);
export type TexturaSuelo = z.infer<typeof TexturaSueloSchema>;

export const CATEGORIAS_COBERTURA = ["agricola", "pastizal", "natural", "bosque", "urbano", "agua", "nieve", "arido"] as const;
export const CategoriaCoberturaSchema = z.enum(CATEGORIAS_COBERTURA);
export type CategoriaCobertura = z.infer<typeof CategoriaCoberturaSchema>;

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export const AnalizarTerrenoSchema = z.object({
  area: AreaSeleccionadaSchema,
});
export type AnalizarTerrenoInput = z.infer<typeof AnalizarTerrenoSchema>;

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

const LatLonSchema = z.tuple([z.number(), z.number()]);
const MesSchema = z.number().int().min(1).max(12);

export const ViaDetectadaSchema = z.object({
  /** Valor de highway=* en OpenStreetMap (motorway, primary, residential, track...). */
  tipo: z.string(),
  nombre: z.string().nullable(),
  /** Distancia del punto analizado (o del centro del área) al eje de la vía. */
  distanciaM: z.number(),
  /** Mitad del ancho típico de ese tipo de vía: a menos de esto, el punto está sobre la calzada. */
  semiAnchoM: z.number(),
  /** Geometría [lat, lon] para resaltarla en el mapa. */
  geometria: z.array(LatLonSchema),
});
export type ViaDetectadaDto = z.infer<typeof ViaDetectadaSchema>;

export const AfectacionSchema = z.object({
  /** % del área (o 100/0 para un punto) que cae sobre vías, edificaciones o agua. */
  carreteraPct: z.number(),
  edificacionPct: z.number(),
  aguaPct: z.number(),
  /** % que se excluye del cálculo de rotaciones (suma de lo anterior). */
  excluidoPct: z.number(),
  puntosMuestreados: z.number().int(),
});
export type AfectacionDto = z.infer<typeof AfectacionSchema>;

export const SueloSchema = z.object({
  /** Profundidad que se promedia (cm). */
  profundidadCm: z.string(),
  arenaPct: z.number().nullable(),
  limoPct: z.number().nullable(),
  arcillaPct: z.number().nullable(),
  /** Clase simplificada a partir de arena y arcilla (para comparar con el catálogo de cultivos). */
  textura: TexturaSueloSchema.nullable(),
  ph: z.number().nullable(),
  carbonoOrganicoGKg: z.number().nullable(),
  nitrogenoGKg: z.number().nullable(),
  fuente: z.string(),
});
export type SueloDto = z.infer<typeof SueloSchema>;

export const HumedadSueloMensualSchema = z.object({
  mes: MesSchema,
  /** Fracción de saturación 0–1 (NASA POWER GWETTOP / GWETROOT / GWETPROF). */
  superficie: z.number().nullable(),
  raiz: z.number().nullable(),
  perfil: z.number().nullable(),
});
export type HumedadSueloMensualDto = z.infer<typeof HumedadSueloMensualSchema>;

export const NdviMuestraSchema = z.object({ fecha: z.string(), ndvi: z.number() });
export type NdviMuestraDto = z.infer<typeof NdviMuestraSchema>;

export const NdviSchema = z.object({
  fuente: z.string(),
  desde: z.string(),
  hasta: z.string(),
  /** Serie de 16 días (MOD13Q1, 250 m). */
  serie: z.array(NdviMuestraSchema),
  /** Promedio por mes calendario de todos los años. */
  climatologia: z.array(z.object({ mes: MesSchema, ndviMedio: z.number().nullable(), muestras: z.number().int() })).length(12),
  /** Meses en que el lote suele estar sin cultivo (ver reglaBaldio). */
  mesesBaldios: z.array(MesSchema),
  reglaBaldio: z.string(),
  /** Estrés de vegetación: meses del último año con NDVI claramente por debajo de lo normal. */
  estres: z.object({
    mesesConEstres: z.array(MesSchema),
    anomaliaMedia: z.number().nullable(),
    detalle: z.string(),
  }),
});
export type NdviDto = z.infer<typeof NdviSchema>;

export const CoberturaSchema = z.object({
  /** Clase IGBP (MCD12Q1 LC_Type1, 1–17). */
  claseIgbp: z.number().int(),
  nombre: z.string(),
  categoria: CategoriaCoberturaSchema,
  anio: z.number().int(),
  fuente: z.string(),
});
export type CoberturaDto = z.infer<typeof CoberturaSchema>;

export const PerfilTerrenoSchema = z.object({
  ubicacion: UbicacionResueltaSchema,
  aptitud: AptitudTerrenoSchema,
  /** "No se puede sembrar: es carretera", "Apto para sembrar", "Apto: se excluye el 12 % del área"... */
  mensajeAptitud: z.string(),
  afectacion: AfectacionSchema,
  /** Vías que afectan el sitio o están a menos de 50 m (máximo 5, la más cercana primero). */
  viasCercanas: z.array(ViaDetectadaSchema),
  elevacionM: z.number().nullable(),
  pendientePct: z.number().nullable(),
  suelo: SueloSchema.nullable(),
  humedadSuelo: z.array(HumedadSueloMensualSchema).nullable(),
  ndvi: NdviSchema.nullable(),
  cobertura: CoberturaSchema.nullable(),
  fuentes: z.array(z.string()),
  vaciosInformacion: z.array(z.string()),
  advertencias: z.array(z.string()),
});
export type PerfilTerrenoDto = z.infer<typeof PerfilTerrenoSchema>;
