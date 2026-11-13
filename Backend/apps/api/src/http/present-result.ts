/**
 * presentResult: convierte Result<T, DomainError> en una respuesta HTTP semántica.
 */
import type { Context } from "hono";
import type { ZodError } from "zod";
import type { DomainError, Result } from "@agrocore/shared-kernel";

export type HttpStatus = 200 | 201 | 400 | 404 | 409 | 422 | 503;

export function statusFromCode(code: string): HttpStatus {
  if (code === "VALIDATION_ERROR") return 400;
  if (code === "IMPRESORA_NO_DISPONIBLE") return 503;
  if (code.endsWith("_NO_ENCONTRADO")) return 404;
  if (code.endsWith("_DUPLICADO") || code.endsWith("_YA_EXISTE")) return 409;
  return 422;
}

export function presentResult<T>(c: Context, result: Result<T, DomainError>, successStatus: 200 | 201 = 200): Response {
  if (result.ok) {
    // La serialización se mide aparte (Server-Timing "serializacion"): con resultados grandes no es despreciable.
    const medidor = (c.get("container") as { medidor?: { medirSync<T>(e: "serializacion", f: () => T): T } } | undefined)?.medidor;
    const cuerpo = medidor
      ? medidor.medirSync("serializacion", () => JSON.stringify({ ok: true, data: result.value }))
      : JSON.stringify({ ok: true, data: result.value });
    return c.body(cuerpo, successStatus, { "Content-Type": "application/json; charset=UTF-8" });
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
