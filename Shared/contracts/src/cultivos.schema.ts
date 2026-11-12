/**
 * Contratos del módulo cultivos: vocabulario (enums), filtros de consulta y forma de la respuesta.
 * Las reglas de negocio (¿el rango óptimo está dentro del rango posible?, ¿es apto a cierta altitud?)
 * NO van aquí: viven en core (entidad Cultivo).
 */
import { z } from "zod";

/** Familias botánicas presentes en el catálogo. Base de la regla "no repetir familia" de la rotación. */
export const FAMILIAS_BOTANICAS = [
  "solanaceas", // papa
  "fabaceas", // leguminosas: arveja, haba, tarwi, vicia, trébol
  "poaceas", // gramíneas: cebada, trigo, avena, maíz, raigrás
  "amarantaceas", // quinua
  "amarilidaceas", // cebolla
] as const;
export const FamiliaBotanicaSchema = z.enum(FAMILIAS_BOTANICAS);
export type FamiliaBotanica = z.infer<typeof FamiliaBotanicaSchema>;

/** Escala cualitativa común para tolerancia a helada, necesidad de agua y cobertura del suelo. */
export const NIVELES = ["baja", "media", "alta"] as const;
export const NivelSchema = z.enum(NIVELES);
export type Nivel = z.infer<typeof NivelSchema>;

export const VALORES_FORRAJEROS = ["ninguno", "bajo", "medio", "alto"] as const;
export const ValorForrajeroSchema = z.enum(VALORES_FORRAJEROS);
export type ValorForrajero = z.infer<typeof ValorForrajeroSchema>;

/** Para qué se siembra el cultivo en la rotación. */
export const USOS_CULTIVO = ["alimento", "forraje", "doble_proposito"] as const;
export const UsoCultivoSchema = z.enum(USOS_CULTIVO);
export type UsoCultivo = z.infer<typeof UsoCultivoSchema>;

/** Resultado de comparar la altitud de una finca con los rangos del cultivo. */
export const APTITUDES_ALTITUD = ["optima", "posible", "no_apta"] as const;
export const AptitudAltitudSchema = z.enum(APTITUDES_ALTITUD);
export type AptitudAltitud = z.infer<typeof AptitudAltitudSchema>;

/** Clave estable del cultivo (slug en minúsculas). Ej.: "papa", "avena_vicia". */
export const ClaveCultivoSchema = z.string().trim().toLowerCase().regex(/^[a-z][a-z_]{1,39}$/, "Clave inválida");

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

/** Query string (llega como texto): todos los filtros son opcionales y se combinan con Y. */
export const ListarCultivosQuerySchema = z.object({
  /** Si se envía, solo devuelve cultivos aptos (óptimos o posibles) a esa altitud y agrega `aptitudAltitud`. */
  altitudM: z.coerce.number().int().min(0).max(9000).optional(),
  familia: FamiliaBotanicaSchema.optional(),
  uso: UsoCultivoSchema.optional(),
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
  /** true = pradera que dura varios años (no entra en la rotación anual como los demás). */
  perenne: z.boolean(),
  /** Días de siembra a cosecha (o al primer corte si es forraje/perenne). */
  cicloDias: RangoSchema,
  /** Rango en el que se puede sembrar y rango en el que rinde mejor (m s. n. m.). */
  altitudM: RangoSchema,
  altitudOptimaM: RangoSchema,
  toleranciaHelada: NivelSchema,
  necesidadAgua: NivelSchema,
  /** Agua que necesita durante el ciclo (lluvia + riego, mm); para perennes, por año. */
  aguaCicloMm: RangoSchema,
  fijaNitrogeno: z.boolean(),
  /** Qué tanto protege el suelo de la erosión (clave en laderas con pendiente). */
  coberturaSuelo: NivelSchema,
  valorForrajero: ValorForrajeroSchema,
  notas: z.array(z.string()),
  fuentes: z.array(z.string()),
  /** Solo aparece cuando se filtró por altitud. */
  aptitudAltitud: AptitudAltitudSchema.optional(),
});
export type CultivoDto = z.infer<typeof CultivoSchema>;
