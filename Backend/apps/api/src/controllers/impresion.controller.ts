/**
 * Controlador de impresión: valida con Zod (forma), invoca el caso de uso del contenedor
 * y delega la respuesta a presentResult (IMPRESORA_NO_DISPONIBLE → 503, sin caída de la API).
 */
import { ImprimirTicketTerrenoSchema } from "@agrocore/contracts";
import { safeHandler } from "../http/safe-handler.ts";
import { presentResult, presentValidationError } from "../http/present-result.ts";

export const impresionController = {
  terreno: safeHandler(async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = ImprimirTicketTerrenoSchema.safeParse(body);
    if (!parsed.success) return presentValidationError(c, parsed.error);
    const result = await c.get("container").imprimirTicketTerreno.execute(parsed.data, c.get("contexto"));
    return presentResult(c, result);
  }),
};
