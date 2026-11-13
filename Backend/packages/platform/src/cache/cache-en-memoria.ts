/**
 * Caché TTL en memoria + helper obtenerConCache (memoria -> persistente -> cargar).
 */
import type { ICacheProveedores } from "@agrocore/core";
import type { DomainError } from "@agrocore/shared-kernel";
import { Result } from "@agrocore/shared-kernel";
import { registrarTiempo } from "../medicion/medidor-tiempos.ts";

const DIA_MS = 86_400_000;

export class CacheEnMemoria {
  private readonly datos = new Map<string, { valor: unknown; expira: number }>();

  private readonly errores = new Map<string, { error: DomainError; expira: number }>();

  constructor(private readonly maxEntradas = 500) {}

  obtener<T>(clave: string): T | null {
    const e = this.datos.get(clave);
    if (!e) return null;
    if (e.expira <= Date.now()) {
      this.datos.delete(clave);
      return null;
    }
    return e.valor as T;
  }

  guardar(clave: string, valor: unknown, ttlDias: number): void {
    this.datos.delete(clave);
    if (this.datos.size >= this.maxEntradas) {
      const masAntigua = this.datos.keys().next().value;
      if (masAntigua !== undefined) this.datos.delete(masAntigua);
    }
    this.datos.set(clave, { valor, expira: Date.now() + ttlDias * DIA_MS });
  }

  /** Error recordado (caché negativa) o null si no hay o ya venció. */
  obtenerError(clave: string): DomainError | null {
    const e = this.errores.get(clave);
    if (!e) return null;
    if (e.expira <= Date.now()) {
      this.errores.delete(clave);
      return null;
    }
    return e.error;
  }

  guardarError(clave: string, error: DomainError, ttlMs: number): void {
    this.errores.delete(clave);
    if (this.errores.size >= this.maxEntradas) {
      const masAntigua = this.errores.keys().next().value;
      if (masAntigua !== undefined) this.errores.delete(masAntigua);
    }
    this.errores.set(clave, { error, expira: Date.now() + ttlMs });
  }

  get tamano(): number {
    return this.datos.size;
  }
}

/** Claves largas (>180 caracteres) se acortan a prefijo + SHA-256 hex. */
export async function normalizarClave(clave: string): Promise<string> {
  if (clave.length <= 180) return clave;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clave));
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return clave.slice(0, 40) + ":" + hex;
}

const enVuelo = new Map<string, Promise<Result<unknown, DomainError>>>();

export async function obtenerConCache<T>(
  clave: string,
  proveedor: string,
  ttlDias: number,
  memoria: CacheEnMemoria,
  persistente: ICacheProveedores | undefined,
  cargar: () => Promise<Result<T, DomainError>>,
  /** Caché negativa: ms que se recuerda un Result.err antes de volver a intentar (0 = no recordar). */
  ttlNegativoMs = 0,
): Promise<Result<T, DomainError>> {
  const k = await normalizarClave(clave);
  const enMemoria = memoria.obtener<T>(k);
  if (enMemoria !== null) return Result.ok(enMemoria);
  const errorRecordado = memoria.obtenerError(k);
  if (errorRecordado) return Result.err(errorRecordado);

  const existente = enVuelo.get(k);
  if (existente) return (await existente) as Result<T, DomainError>;

  const tarea = (async (): Promise<Result<T, DomainError>> => {
    if (persistente) {
      try {
        const inicioMysql = performance.now();
        const guardado = await persistente.obtener<T>(k);
        registrarTiempo("mysql", performance.now() - inicioMysql);
        if (guardado !== null && guardado !== undefined) {
          memoria.guardar(k, guardado, ttlDias);
          return Result.ok(guardado);
        }
      } catch { /* una caché caída no tumba la consulta */ }
    }

    const resultado = await cargar();
    if (resultado.ok) {
      memoria.guardar(k, resultado.value, ttlDias);
      if (persistente) {
        try {
          const inicioMysql = performance.now();
          await persistente.guardar(k, proveedor, resultado.value, ttlDias);
          registrarTiempo("mysql", performance.now() - inicioMysql);
        } catch { /* ignorar */ }
      }
    } else if (ttlNegativoMs > 0) {
      memoria.guardarError(k, resultado.error, ttlNegativoMs);
    }
    return resultado;
  })();

  enVuelo.set(k, tarea as Promise<Result<unknown, DomainError>>);
  try {
    return await tarea;
  } finally {
    enVuelo.delete(k);
  }
}
