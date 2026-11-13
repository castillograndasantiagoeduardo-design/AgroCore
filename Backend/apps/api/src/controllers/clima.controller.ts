/**
 * Controlador de clima: valida con Zod (forma), invoca el caso de uso del contenedor
 * y delega la respuesta a presentResult. Sin lógica de negocio ni instanciación manual.
 */
import { PerfilClimaticoParamsSchema } from "@agrocore/contracts";
import { safeHandler } from "../http/safe-handler.ts";
import { presentResult, presentValidationError } from "../http/present-result.ts";

export const climaController = {
  perfilFinca: safeHandler(async (c) => {
    const parsed = PerfilClimaticoParamsSchema.safeParse({ fincaId: c.req.param("fincaId") });
    if (!parsed.success) return presentValidationError(c, parsed.error);
    const result = await c.get("container").obtenerPerfilClimatico.execute(parsed.data, c.get("contexto"));
    return presentResult(c, result);
  }),
};
