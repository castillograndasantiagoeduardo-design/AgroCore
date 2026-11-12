/**
 * Controlador de cultivos: valida con Zod (forma), invoca el caso de uso del contenedor
 * y delega la respuesta a presentResult. Sin lógica de negocio ni instanciación manual.
 */
import { ListarCultivosQuerySchema, ObtenerCultivoParamsSchema } from "@duitamacrece/contracts";
import { safeHandler } from "../http/safe-handler.ts";
import { presentResult, presentValidationError } from "../http/present-result.ts";

export const cultivosController = {
  listar: safeHandler(async (c) => {
    const parsed = ListarCultivosQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return presentValidationError(c, parsed.error);
    const result = await c.get("container").listarCultivos.execute(parsed.data, c.get("actor"));
    return presentResult(c, result);
  }),

  obtener: safeHandler(async (c) => {
    const parsed = ObtenerCultivoParamsSchema.safeParse({ clave: c.req.param("clave") });
    if (!parsed.success) return presentValidationError(c, parsed.error);
    const result = await c.get("container").obtenerCultivo.execute(parsed.data, c.get("actor"));
    return presentResult(c, result);
  }),
};
