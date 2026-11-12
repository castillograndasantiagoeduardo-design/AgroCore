/**
 * Controlador de autenticación: valida el cuerpo con LoginSchema e invoca IniciarSesionUseCase.
 */
import { LoginSchema } from "@duitamacrece/contracts";
import { safeHandler } from "../http/safe-handler.ts";
import { presentResult, presentValidationError } from "../http/present-result.ts";

export const authController = {
  login: safeHandler(async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) return presentValidationError(c, parsed.error);
    const result = await c.get("container").iniciarSesion.execute(parsed.data);
    return presentResult(c, result, 200);
  }),
};

