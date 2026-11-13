/**
 * Contratos del módulo cultivos: vocabulario (enums), filtros de consulta y forma de la respuesta.
 * Catálogo GLOBAL (climas fríos, templados, tropicales y áridos), con rangos al estilo FAO ECOCROP.
 * Las reglas de negocio (¿el rango óptimo está dentro del absoluto?, ¿es apto a cierta temperatura?)
 * NO van aquí: viven en core (entidad Cultivo).
 */
import { z } from "zod";
import { TexturaSueloSchema } from "./terreno.schema.ts";
import { DatoNumericoSchema, FuenteDatoSchema, TipoDatoSchema } from "./dato.schema.ts";

/** Familias botánicas del catálogo. Base de la regla "no repetir familia" de la rotación. */
export const FAMILIAS_BOTANICAS = [
  "solanaceas", // papa, tomate, pimiento
  "fabaceas", // leguminosas: frijol, arveja, haba, soya, alfalfa, vicia...
  "poaceas", // gramíneas: maíz, trigo, arroz, sorgo, avena, raigrás...
  "amarantaceas", // quinua, amaranto, remolacha
  "amarilidaceas", // cebolla, ajo
  "brasicaceas", // repollo, colza, mostaza, rábano
  "cucurbitaceas", // calabaza, pepino
  "asteraceas", // girasol, lechuga
  "apiaceas", // zanahoria
  "euforbiaceas", // yuca
  "convolvulaceas", // batata
  "malvaceas", // algodón
  "pedaliaceas", // sésamo
  "poligonaceas", // trigo sarraceno
  "linaceas", // lino
  "hidrofilaceas", // facelia
  "oxalidaceas", // oca
  "baselaceas", // ulluco
] as const;
export const FamiliaBotanicaSchema = z.enum(FAMILIAS_BOTANICAS);
export type FamiliaBotanica = z.infer<typeof FamiliaBotanicaSchema>;

/** Escala cualitativa común para tolerancias, necesidad de agua y cobertura del suelo. */
export const NIVELES = ["baja", "media", "alta"] as const;
export const NivelSchema = z.enum(NIVELES);
export type Nivel = z.infer<typeof NivelSchema>;

export const VALORES_FORRAJEROS = ["ninguno", "bajo", "medio", "alto"] as const;
export const ValorForrajeroSchema = z.enum(VALORES_FORRAJEROS);
export type ValorForrajero = z.infer<typeof ValorForrajeroSchema>;

/** Para qué se siembra el cultivo en la rotación. */
export const USOS_CULTIVO = ["alimento", "forraje", "doble_proposito", "cobertura"] as const;
export const UsoCultivoSchema = z.enum(USOS_CULTIVO);
export type UsoCultivo = z.infer<typeof UsoCultivoSchema>;

export const GRUPOS_CULTIVO = [
  "cereal",
  "pseudocereal",
  "leguminosa",
  "tuberculo",
  "hortaliza",
  "oleaginosa",
  "forraje",
  "cobertura",
  "industrial",
] as const;
export const GrupoCultivoSchema = z.enum(GRUPOS_CULTIVO);
export type GrupoCultivo = z.infer<typeof GrupoCultivoSchema>;

export const PROFUNDIDADES_RAIZ = ["superficial", "media", "profunda"] as const;
export const ProfundidadRaizSchema = z.enum(PROFUNDIDADES_RAIZ);
export type ProfundidadRaiz = z.infer<typeof ProfundidadRaizSchema>;

/** Resultado de comparar la temperatura media de un sitio (o de un ciclo) con los rangos del cultivo. */
export const APTITUDES_CLIMA = ["optima", "posible", "no_apta"] as const;
export const AptitudClimaSchema = z.enum(APTITUDES_CLIMA);
export type AptitudClima = z.infer<typeof AptitudClimaSchema>;

/** Clave estable del cultivo (slug en minúsculas). Ej.: "papa", "avena_vicia". */
export const ClaveCultivoSchema = z.string().trim().toLowerCase().regex(/^[a-z][a-z_]{1,39}$/, "Clave inválida");

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

/** Query string (llega como texto): todos los filtros son opcionales y se combinan con Y. */
export const ListarCultivosQuerySchema = z.object({
  /** Temperatura media del sitio (°C): devuelve solo los aptos (óptimos primero) y agrega `aptitudClima`. */
  tempMediaC: z.coerce.number().min(-30).max(45).optional(),
  /** Lluvia anual del sitio (mm): descarta los que necesitan claramente más agua (sin riego). */
  lluviaAnualMm: z.coerce.number().min(0).max(15000).optional(),
  /** pH del suelo: descarta los cultivos cuyo pH óptimo está a más de 1 unidad. */
  ph: z.coerce.number().min(3).max(10).optional(),
  textura: TexturaSueloSchema.optional(),
  familia: FamiliaBotanicaSchema.optional(),
  uso: UsoCultivoSchema.optional(),
  grupo: GrupoCultivoSchema.optional(),
  /** "true" / "false" en la URL. */
  fijaNitrogeno: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  /** Tolerancia mínima: "media" devuelve los de tolerancia media y alta. */
  toleranciaHeladaMin: NivelSchema.optional(),
});
export type ListarCultivosQuery = z.infer<typeof ListarCultivosQuerySchema>;

export const ObtenerCultivoParamsSchema = z.object({
  clave: ClaveCultivoSchema,
});
export type ObtenerCultivoParams = z.infer<typeof ObtenerCultivoParamsSchema>;

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

const RangoSchema = z.object({ min: z.number(), max: z.number() });

export const CultivoSchema = z.object({
  clave: z.string(),
  nombre: z.string(),
  nombreCientifico: z.string(),
  /** Una asociación (avena + vicia, raigrás + trébol) tiene dos familias. */
  familias: z.array(FamiliaBotanicaSchema).min(1),
  uso: UsoCultivoSchema,
  grupo: GrupoCultivoSchema,
  /** true = pradera o cultivo que dura varios años. */
  perenne: z.boolean(),
  /** Días de siembra a cosecha (o al primer corte / a la incorporación si es cobertura). */
  cicloDias: RangoSchema,
  /** true si su ciclo normal cruza más de una temporada de cultivo (maíz de altura, tarwi, yuca...). */
  ocupaVariasTemporadas: z.boolean(),
  /** Temperatura MEDIA del aire durante el ciclo (°C): rango óptimo y rango absoluto (FAO ECOCROP). */
  temperaturaOptimaC: RangoSchema,
  temperaturaAbsolutaC: RangoSchema,
  /** Lluvia anual óptima (mm, ECOCROP). */
  lluviaAnualOptimaMm: RangoSchema,
  /** Agua que necesita durante el ciclo (lluvia + riego, mm); para perennes, por año. */
  aguaCicloMm: RangoSchema,
  toleranciaHelada: NivelSchema,
  toleranciaCalor: NivelSchema,
  toleranciaSequia: NivelSchema,
  necesidadAgua: NivelSchema,
  phOptimo: RangoSchema,
  texturas: z.array(TexturaSueloSchema).min(1),
  profundidadRaiz: ProfundidadRaizSchema,
  fijaNitrogeno: z.boolean(),
  /** Qué tanto protege el suelo de la erosión (clave en laderas con pendiente). */
  coberturaSuelo: NivelSchema,
  valorForrajero: ValorForrajeroSchema,
  notas: z.array(z.string()),
  fuentes: z.array(z.string()).min(1),
  /** Registro(s) de FAO ECOCROP de donde salen los valores (EcoPortCode). Vacío = no está en ECOCROP. */
  ecocrop: z.object({ codigos: z.array(z.number().int()), url: z.string() }),
  /** Fuente concreta de cada valor que usa el motor para decidir. */
  fuentesValores: z.array(z.object({ campo: z.string(), fuente: FuenteDatoSchema, tipo: TipoDatoSchema, referencia: z.string() })),
  /** Campos sin fuente verificable: el motor NO los usa para decidir (excluye el cultivo u omite la regla). */
  camposSinFuente: z.array(z.string()),
  /** Valor bruto de la producción por hectárea (FAOSTAT, mundo, I$ constantes 2014-2016). null = sin datos. */
  valorProduccionHa: DatoNumericoSchema,
  /** Solo aparece cuando se filtró por temperatura media del sitio. */
  aptitudClima: AptitudClimaSchema.optional(),
});
export type CultivoDto = z.infer<typeof CultivoSchema>;
