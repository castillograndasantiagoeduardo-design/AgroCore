/**
 * Contratos del módulo impresion: ticket térmico (ESC/POS, 58 mm = 32 caracteres en fuente A) con el
 * resumen del terreno seleccionado. El backend recalcula el análisis (con caché: una sola fuente de verdad)
 * y lo envía a la impresora compartida en Windows.
 */
import { z } from "zod";
import { CompararRotacionesUbicacionSchema } from "./rotaciones.schema.ts";

/** Caracteres por línea: 58 mm (48 mm útiles) en fuente A. */
export const ANCHO_TICKET_58MM = 32;

export const ESTILOS_LINEA = ["titulo", "negrita", "normal", "separador", "centrado"] as const;
export const EstiloLineaSchema = z.enum(ESTILOS_LINEA);
export type EstiloLinea = z.infer<typeof EstiloLineaSchema>;

export const LineaTicketSchema = z.object({
  texto: z.string(),
  estilo: EstiloLineaSchema,
});
export type LineaTicketDto = z.infer<typeof LineaTicketSchema>;

/** POST /api/impresion/terreno: la misma entrada que la comparación de rotaciones, más un nombre opcional. */
export const ImprimirTicketTerrenoSchema = CompararRotacionesUbicacionSchema.extend({
  /** Nombre del lote o de la finca para el encabezado del ticket. */
  nombre: z.string().trim().min(1).max(40).optional(),
  /** true = solo componer el ticket (vista previa), sin enviarlo a la impresora. */
  soloVistaPrevia: z.boolean().default(false),
});
export type ImprimirTicketTerrenoInput = z.infer<typeof ImprimirTicketTerrenoSchema>;

export const ResultadoImpresionSchema = z.object({
  impreso: z.boolean(),
  /** Nombre de la impresora compartida usada (null en vista previa). */
  impresora: z.string().nullable(),
  anchoCaracteres: z.number().int(),
  lineas: z.array(LineaTicketSchema).min(1),
});
export type ResultadoImpresionDto = z.infer<typeof ResultadoImpresionSchema>;
