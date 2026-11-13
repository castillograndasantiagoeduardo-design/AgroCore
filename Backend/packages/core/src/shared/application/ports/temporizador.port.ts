/**
 * Puerto ITemporizador: espera un tiempo (plazo máximo de una petición, fase 2.7).
 * core no usa setTimeout directamente (Regla 2); la implementación vive en platform (TemporizadorSistema)
 * y en los tests se usa uno falso o con plazos cortos.
 */
export interface ITemporizador {
  /** Se resuelve después de `ms` milisegundos. */
  esperar(ms: number): Promise<void>;
}

/** Resultado de esperar una tarea con plazo: su valor o "vencido". */
export type ConPlazo<T> = { vencido: false; valor: T } | { vencido: true };

/** Espera `tarea` como máximo hasta que se cumpla `plazo` (una promesa que se resuelve al vencer). */
export async function conPlazo<T>(tarea: Promise<T>, plazo: Promise<void>): Promise<ConPlazo<T>> {
  return await Promise.race([
    tarea.then((valor): ConPlazo<T> => ({ vencido: false, valor })),
    plazo.then((): ConPlazo<T> => ({ vencido: true })),
  ]);
}
