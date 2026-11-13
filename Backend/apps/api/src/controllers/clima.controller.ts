/**
 * Controlador de clima: valida con Zod (forma), invoca el caso de uso del contenedor
 * y delega la respuesta a presentResult. Sin lógica de negocio ni instanciación manual.
 */
import { PerfilClimaticoUbicacionSchema } from "@agrocore/contracts";
import { safeHandler } from "../http/safe-handler.ts";
import { presentResult, presentValidationError } from "../http/present-result.ts";

export const climaController = {
  perfilUbicacion: safeHandler(async (c) => {
    const parsed = PerfilClimaticoUbicacionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return presentValidationError(c, parsed.error);
    const { latitud, longitud, altitudM } = parsed.data;
    const result = await c.get("container").obtenerPerfilClimatico.porUbicacion({ latitud, longitud, altitudM: altitudM ?? null }, c.get("contexto"));
    return presentResult(c, result);
  }),
};
