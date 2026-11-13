/**
 * servidorTiempos: mide cada petición y su desglose por proveedor.
 *   - Cabecera `Server-Timing` (visible en la pestaña Red del navegador y en scripts/medir-tiempos.ts).
 *   - Una línea de log por petición: método, ruta, estado, total y desglose.
 */
import type { MiddlewareHandler } from "hono";
import { ejecutarConMedicion, formatearServerTiming } from "@agrocore/composition";
import type { AppEnv } from "../types.ts";

export const servidorTiempos: MiddlewareHandler<AppEnv> = async (c, next) => {
  const { tiempos, totalMs } = await ejecutarConMedicion(() => next());
  const cabecera = formatearServerTiming(tiempos, totalMs);
  // Respuestas en streaming ya enviaron sus cabeceras: ahí el desglose va solo al log.
  try {
    c.res.headers.set("Server-Timing", cabecera);
    c.res.headers.set("Timing-Allow-Origin", "*");
  } catch { /* cabeceras inmutables */ }
  const desglose = [...tiempos.entries()].map(([k, t]) => k + "=" + Math.round(t.ms)).join(" ");
  console.log("[api] " + c.req.method + " " + c.req.path + " " + c.res.status + " " + Math.round(totalMs) + "ms" + (desglose ? " · " + desglose : ""));
};
