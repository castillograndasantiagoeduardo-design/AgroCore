/**
 * Result<T, E>: reemplaza el uso de throw para errores de negocio.
 * Uso: Result.ok(valor) | Result.err(new DomainError("CODIGO", "Mensaje"))
 */

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const Result = {
  ok<T>(value: T): Result<T, never> {
    return { ok: true, value };
  },
  err<E>(error: E): Result<never, E> {
    return { ok: false, error };
  },
};
