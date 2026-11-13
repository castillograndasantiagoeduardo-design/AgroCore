/**
 * fetchConReintentos: fetch con timeout y reintentos con backoff exponencial.
 * Uso interno de los adaptadores de platform: LANZA si agota los intentos, y cada adaptador
 * lo envuelve en try/catch para convertirlo en Result.err.
 */
export const USER_AGENT_POR_DEFECTO = "AgroCore/0.2 (demo NASA Space Apps; agricultura)";

export interface OpcionesFetch {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  timeoutMs: number;
  /** Reintentos adicionales al primer intento (0 = un solo intento). */
  reintentos: number;
  /** Espera antes del primer reintento; se duplica en cada uno. */
  esperaInicialMs: number;
}

const ESTADOS_REINTENTABLES = new Set([429, 500, 502, 503, 504]);

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function describirError(error: unknown, timeoutMs?: number): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "tardó más de " + ((timeoutMs ?? 0) / 1000) + " s";
  }
  return error instanceof Error ? error.message : String(error);
}

/** Devuelve la Response (también si es 4xx no reintentable o si se agotaron reintentos con 5xx). Lanza ante error de red/timeout final. */
export async function fetchConReintentos(url: string | URL, opciones: OpcionesFetch): Promise<Response> {
  const headers = { "User-Agent": USER_AGENT_POR_DEFECTO, ...(opciones.headers ?? {}) };
  let espera = opciones.esperaInicialMs;
  for (let intento = 0;; intento++) {
    const ultimo = intento >= opciones.reintentos;
    try {
      const respuesta = await fetch(url, {
        method: opciones.method ?? "GET",
        body: opciones.body,
        headers,
        signal: AbortSignal.timeout(opciones.timeoutMs),
      });
      if (!ESTADOS_REINTENTABLES.has(respuesta.status) || ultimo) return respuesta;
      await respuesta.body?.cancel();
    } catch (error) {
      if (ultimo) throw new Error(describirError(error, opciones.timeoutMs));
    }
    await dormir(espera);
    espera *= 2;
  }
}
