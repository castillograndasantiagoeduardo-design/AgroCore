/**
 * Controlador de terreno: valida con Zod (forma), invoca el caso de uso del contenedor
 * y delega la respuesta a presentResult. Sin lógica de negocio ni instanciación manual.
 */
import { AnalizarTerrenoSchema } from "@agrocore/contracts";
import { safeHandler } from "../http/safe-handler.ts";
import { presentResult, presentValidationError } from "../http/present-result.ts";

export const terrenoController = {
  analizar: safeHandler(async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = AnalizarTerrenoSchema.safeParse(body);
    if (!parsed.success) return presentValidationError(c, parsed.error);
    const result = await c.get("container").analizarTerreno.execute(parsed.data, c.get("contexto"));
    return presentResult(c, result);
  }),
};
