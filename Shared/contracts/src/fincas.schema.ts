/**
 * Contratos del módulo fincas: validan la FORMA del dato en la frontera.
 * Las reglas de negocio (¿está la finca dentro de Duitama?, ¿la altitud es razonable?)
 * NO van aquí: viven en core (UbicacionFinca).
 */
import { z } from "zod";
import { ClaveCultivoSchema } from "./cultivos.schema.ts";

/** Zonas de trabajo de Duitama según la altitud (ver core/fincas/domain/value-objects/ubicacion-finca.vo.ts). */
export const ZONAS_ALTITUDINALES = ["valle", "ladera", "alta"] as const;
export const ZonaAltitudinalSchema = z.enum(ZONAS_ALTITUDINALES);
export type ZonaAltitudinal = z.infer<typeof ZonaAltitudinalSchema>;

export const CrearFincaSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  descripcion: z.string().trim().max(500).optional(),
  /** Grados decimales (WGS84). Ej.: 5.8269 */
  latitud: z.number().min(-90).max(90),
  /** Grados decimales (WGS84). Ej.: -73.0297 (negativa: oeste de Greenwich) */
  longitud: z.number().min(-180).max(180),
  /** Metros sobre el nivel del mar. Opcional: si no se envía, se completará luego con SRTM. */
  altitudM: z.number().int().min(0).max(9000).optional(),
  vereda: z.string().trim().min(2).max(80).optional(),
  tieneRiego: z.boolean().default(false),
  /** Clave del catálogo de cultivos (ej. "papa", "avena_vicia"). core verifica que exista. */
  cultivoActual: ClaveCultivoSchema.optional(),
});
export type CrearFincaInput = z.input<typeof CrearFincaSchema>;

export const ListarFincasQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListarFincasQuery = z.infer<typeof ListarFincasQuerySchema>;

export const FincaSchema = z.object({
  id: z.number().int(),
  nombre: z.string(),
  descripcion: z.string().nullable(),
  latitud: z.number(),
  longitud: z.number(),
  altitudM: z.number().int().nullable(),
  /** Calculada por core a partir de altitudM; null si aún no se conoce la altitud. */
  zonaAltitudinal: ZonaAltitudinalSchema.nullable(),
  vereda: z.string().nullable(),
  tieneRiego: z.boolean(),
  /** Clave del catálogo de cultivos, o null si no se registró. */
  cultivoActual: z.string().nullable(),
  activo: z.boolean(),
  creadoEn: z.string().nullable(),
});
export type FincaDto = z.infer<typeof FincaSchema>;
