/**
 * Cliente HTTP de la recomendación por época.
 *   flujo()    POST /api/recomendacion/flujo: lee la respuesta NDJSON línea por línea y entrega cada evento
 *              (paso de carga, dato del lugar, etapa rápida, detalle, error, fin). Se cancela con AbortSignal.
 *   precargar() POST /api/recomendacion/rapida sin esperar el resultado: calienta las cachés del servidor para la
 *              celda bajo el cursor (al presionar el mouse para dibujar o al terminar de mover el mapa).
 */
import { EventoRecomendacionSchema, type EventoRecomendacionDto, type RecomendacionInput } from "@agrocore/contracts";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

export async function flujo(
  entrada: RecomendacionInput,
  onEvento: (e: EventoRecomendacionDto) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(API_URL + "/api/recomendacion/flujo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entrada),
    signal,
  });
  if (!res.ok || !res.body) {
    let mensaje = "El servidor respondió " + res.status;
    try {
      const cuerpo = await res.json();
      if (cuerpo?.error?.message) mensaje = cuerpo.error.message;
    } catch { /* sin cuerpo JSON */ }
    onEvento({ tipo: "error", etapa: "rapida", error: { code: "HTTP_" + res.status, message: mensaje } });
    return;
  }
  const lector = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let pendiente = "";
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    pendiente += value;
    const lineas = pendiente.split("\n");
    pendiente = lineas.pop() ?? "";
    for (const linea of lineas) emitir(linea, onEvento);
  }
  if (pendiente.trim()) emitir(pendiente, onEvento);
}

function emitir(linea: string, onEvento: (e: EventoRecomendacionDto) => void) {
  if (!linea.trim()) return;
  try {
    const parsed = EventoRecomendacionSchema.safeParse(JSON.parse(linea));
    if (parsed.success) onEvento(parsed.data);
  } catch { /* línea cortada: se ignora */ }
}

/** Precarga sin bloquear (errores ignorados). Devuelve la función para cancelarla. */
export function precargar(entrada: RecomendacionInput): () => void {
  const control = new AbortController();
  fetch(API_URL + "/api/recomendacion/rapida", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entrada),
    signal: control.signal,
    keepalive: false,
  }).then((r) => r.body?.cancel()).catch(() => {});
  return () => control.abort();
}
