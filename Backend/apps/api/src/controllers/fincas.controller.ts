/**
 * Controlador de fincas: valida con Zod (forma), invoca el caso de uso del contenedor
 * y delega la respuesta a presentResult. Sin lógica de negocio ni instanciación manual.
 */
import { CrearFincaSchema, ListarFincasQuerySchema } from "@duitamacrece/contracts";
import { safeHandler } from "../http/safe-handler.ts";
import { presentResult, presentValidationError } from "../http/present-result.ts";

export const fincasController = {
  listar: safeHandler(async (c) => {
    const parsed = ListarFincasQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return presentValidationError(c, parsed.error);
    const result = await c.get("container").listarFincas.execute(parsed.data, c.get("actor"));
    return presentResult(c, result);
  }),

  crear: safeHandler(async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = CrearFincaSchema.safeParse(body);
    if (!parsed.success) return presentValidationError(c, parsed.error);
    const result = await c.get("container").crearFinca.execute(parsed.data, c.get("actor"));
    return presentResult(c, result, 201);
  }),
};
