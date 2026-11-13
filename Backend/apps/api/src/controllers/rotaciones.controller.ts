/**
 * Controlador de rotaciones: valida con Zod (forma), invoca el caso de uso del contenedor
 * y delega la respuesta a presentResult. Sin lógica de negocio ni instanciación manual.
 */
import { CompararRotacionesSchema } from "@duitamacrece/contracts";
import { safeHandler } from "../http/safe-handler.ts";
import { presentResult, presentValidationError } from "../http/present-result.ts";

export const rotacionesController = {
  comparar: safeHandler(async (c) => {
    // Un body vacío es válido: todas las prioridades valen 3.
    const raw = await c.req.json().catch(() => ({}));
    const body = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const parsed = CompararRotacionesSchema.safeParse({ ...body, fincaId: c.req.param("fincaId") });
    if (!parsed.success) return presentValidationError(c, parsed.error);
    const result = await c.get("container").compararRotaciones.execute(parsed.data, c.get("contexto"));
    return presentResult(c, result);
  }),
};
