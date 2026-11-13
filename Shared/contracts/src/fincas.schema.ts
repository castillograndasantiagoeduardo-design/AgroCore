/**
 * Contratos del módulo fincas: validan la FORMA del dato en la frontera.
 * La finca puede estar en cualquier lugar del mundo. Las reglas de negocio (altitud razonable,
 * área máxima del polígono) NO van aquí: viven en core (UbicacionFinca y AreaSeleccionada).
 */
import { z } from "zod";
import { ClaveCultivoSchema } from "./cultivos.schema.ts";
import { LatitudSchema, LongitudSchema, PoligonoGeoJsonSchema } from "./geo.schema.ts";

export const CrearFincaSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  descripcion: z.string().trim().max(500).optional(),
  /** Grados decimales (WGS84). Ej.: 5.8269 */
  latitud: LatitudSchema,
  /** Grados decimales (WGS84). Ej.: -73.0297 (negativa: oeste de Greenwich) */
  longitud: LongitudSchema,
  /** Metros sobre el nivel del mar (−500 a 6.000). Opcional: si no se envía, se usa SRTM o la celda del clima. */
  altitudM: z.number().int().optional(),
  /** Vereda, aldea, condado o paraje. */
  localidad: z.string().trim().min(2).max(80).optional(),
  pais: z.string().trim().min(2).max(80).optional(),
  /** Departamento, estado, provincia o región. */
  region: z.string().trim().min(2).max(80).optional(),
  /** Polígono del lote (opcional): hasta 100 ha. */
  area: PoligonoGeoJsonSchema.optional(),
  tieneRiego: z.boolean().default(false),
  /** Clave del catálogo de cultivos (ej. "papa", "maiz"). core verifica que exista. */
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
  localidad: z.string().nullable(),
  pais: z.string().nullable(),
  region: z.string().nullable(),
  /** Polígono del lote, o null si la finca es solo un punto. */
  area: PoligonoGeoJsonSchema.nullable(),
  /** Hectáreas del polígono (calculadas por core), o null. */
  areaHa: z.number().nullable(),
  tieneRiego: z.boolean(),
  /** Clave del catálogo de cultivos, o null si no se registró. */
  cultivoActual: z.string().nullable(),
  activo: z.boolean(),
  creadoEn: z.string().nullable(),
});
export type FincaDto = z.infer<typeof FincaSchema>;
