/**
 * MedidorTiemposAls: implementa IMedidorTiempos con performance.now() y AsyncLocalStorage.
 *
 * Cada petición HTTP (o cada medición de scripts/medir-tiempos.ts) corre dentro de `ejecutarConMedicion`,
 * que crea un almacén propio; las tareas medidas suman su duración por etiqueta aunque corran en paralelo.
 * Fuera de una medición, medir() solo ejecuta la tarea.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { EtiquetaTiempo, IMedidorTiempos } from "@agrocore/core";

export interface TiempoEtiqueta {
  ms: number;
  veces: number;
}
export type TiemposPeticion = Map<string, TiempoEtiqueta>;

const almacen = new AsyncLocalStorage<TiemposPeticion>();

/** Suma `ms` a la etiqueta en la medición actual (si hay una). */
export function registrarTiempo(etiqueta: string, ms: number): void {
  const tiempos = almacen.getStore();
  if (!tiempos) return;
  const t = tiempos.get(etiqueta) ?? { ms: 0, veces: 0 };
  t.ms += ms;
  t.veces++;
  tiempos.set(etiqueta, t);
}

/** Ejecuta `tarea` con un almacén de tiempos nuevo y devuelve su valor, los tiempos y el total. */
export async function ejecutarConMedicion<T>(tarea: () => Promise<T>): Promise<{ valor: T; tiempos: TiemposPeticion; totalMs: number }> {
  const tiempos: TiemposPeticion = new Map();
  const inicio = performance.now();
  const valor = await almacen.run(tiempos, tarea);
  return { valor, tiempos, totalMs: performance.now() - inicio };
}

/** Tiempos de la medición en curso (para leerlos antes de que termine, p. ej. al responder por partes). */
export function tiemposActuales(): TiemposPeticion | undefined {
  return almacen.getStore();
}

/** Cabecera Server-Timing: `power_sitio;dur=1234.5, motor;dur=12.3, total;dur=1300`. */
export function formatearServerTiming(tiempos: TiemposPeticion, totalMs?: number): string {
  const partes = [...tiempos.entries()].map(([k, t]) => k + ";dur=" + t.ms.toFixed(1) + (t.veces > 1 ? ';desc="' + t.veces + ' llamadas"' : ""));
  if (totalMs !== undefined) partes.push("total;dur=" + totalMs.toFixed(1));
  return partes.join(", ");
}

export class MedidorTiemposAls implements IMedidorTiempos {
  async medir<T>(etiqueta: EtiquetaTiempo, tarea: () => Promise<T>): Promise<T> {
    const inicio = performance.now();
    try {
      return await tarea();
    } finally {
      registrarTiempo(etiqueta, performance.now() - inicio);
    }
  }

  medirSync<T>(etiqueta: EtiquetaTiempo, tarea: () => T): T {
    const inicio = performance.now();
    try {
      return tarea();
    } finally {
      registrarTiempo(etiqueta, performance.now() - inicio);
    }
  }
}
