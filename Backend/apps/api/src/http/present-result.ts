/**
 * presentResult: convierte Result<T, DomainError> en una respuesta HTTP semántica.
 */
import type { Context } from "hono";
import type { ZodError } from "zod";
import type { DomainError, Result } from "@duitamacrece/shared-kernel";

export type HttpStatus = 200 | 201 | 400 | 401 | 403 | 404 | 409 | 422;

export function statusFromCode(code: string): HttpStatus {
  if (code === "VALIDATION_ERROR") return 400;
  if (code === "NO_AUTENTICADO" || code === "TOKEN_INVALIDO" || code === "AUTH_CREDENCIALES_INVALIDAS") return 401;
  if (code === "PERMISO_DENEGADO") return 403;
  if (code.endsWith("_NO_ENCONTRADO")) return 404;
  if (code.endsWith("_DUPLICADO") || code.endsWith("_YA_EXISTE")) return 409;
  return 422;
}

export function presentResult<T>(c: Context, result: Result<T, DomainError>, successStatus: 200 | 201 = 200): Response {
  if (result.ok) {
    return c.json({ ok: true, data: result.value }, successStatus);
  }
  return c.json(
    { ok: false, error: { code: result.error.code, message: result.error.message } },
    statusFromCode(result.error.code),
  );
}

export function presentValidationError(c: Context, error: ZodError): Response {
  return c.json(
    {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Datos de entrada inválidos", detalles: error.flatten().fieldErrors },
    },
    400,
  );
}
