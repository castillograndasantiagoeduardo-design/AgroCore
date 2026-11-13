/**
 * Contratos geográficos: lo que el usuario selecciona en el mapa (un punto o un área).
 *
 * Zod valida la FORMA (rangos de coordenadas, cantidad de vértices, anillo GeoJSON).
 * Las reglas de negocio (área máxima en hectáreas, polígono que no se cruza) viven en core
 * (value object AreaSeleccionada).
 */
import { z } from "zod";

/** Máximo de vértices de un polígono (sin contar el de cierre). */
export const MAX_VERTICES_AREA = 100;
/** Área máxima que se puede analizar (hectáreas). La valida core. */
export const AREA_MAXIMA_HA = 100;

export const LatitudSchema = z.number().min(-90).max(90);
export const LongitudSchema = z.number().min(-180).max(180);

/** Posición GeoJSON: [longitud, latitud] (¡en ese orden!). */
export const PosicionGeoJsonSchema = z.tuple([LongitudSchema, LatitudSchema]);

/**
 * Polígono GeoJSON (RFC 7946) con UN solo anillo exterior, sin huecos.
 * El anillo puede venir cerrado (último = primero) o abierto: core lo cierra.
 */
export const PoligonoGeoJsonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z
    .array(z.array(PosicionGeoJsonSchema).min(3).max(MAX_VERTICES_AREA + 1))
    .length(1, "Solo se admite un anillo exterior (sin huecos)"),
});
export type PoligonoGeoJson = z.infer<typeof PoligonoGeoJsonSchema>;

export const PuntoSeleccionadoSchema = z.object({
  tipo: z.literal("punto"),
  latitud: LatitudSchema,
  longitud: LongitudSchema,
});

export const PoligonoSeleccionadoSchema = z.object({
  tipo: z.literal("poligono"),
  geojson: PoligonoGeoJsonSchema,
});

/** Un punto (clic en el mapa) o un polígono dibujado (rectángulo o polígono libre). */
export const AreaSeleccionadaSchema = z.discriminatedUnion("tipo", [PuntoSeleccionadoSchema, PoligonoSeleccionadoSchema]);
export type AreaSeleccionadaDto = z.infer<typeof AreaSeleccionadaSchema>;

/** Resumen geográfico de lo seleccionado, calculado por core. */
export const UbicacionResueltaSchema = z.object({
  tipo: z.enum(["punto", "poligono"]),
  /** Punto representativo (el punto, o el centroide del polígono). */
  latitud: z.number(),
  longitud: z.number(),
  /** null para un punto. */
  areaHa: z.number().nullable(),
  hemisferio: z.enum(["norte", "sur"]),
});
export type UbicacionResueltaDto = z.infer<typeof UbicacionResueltaSchema>;
