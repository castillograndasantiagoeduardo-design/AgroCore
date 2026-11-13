/**
 * Controlador de la recomendación por época: valida con Zod, invoca los casos de uso del contenedor y responde.
 *   rapida   → RecomendacionRapidaDto
 *   detalle  → RecomendacionDetalleDto
 *   flujo    → NDJSON: eventos "paso" y "dato" mientras cada fuente responde, luego "rapida", "detalle" y "fin".
 *              Si el cliente cancela (AbortController), se deja de escribir.
 */
import { type EventoRecomendacionDto, RecomendacionInputSchema } from "@agrocore/contracts";
import type { IReportadorProgreso } from "@agrocore/core";
import { safeHandler } from "../http/safe-handler.ts";
import { presentResult, presentValidationError } from "../http/present-result.ts";

export const recomendacionController = {
  rapida: safeHandler(async (c) => {
    const parsed = RecomendacionInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return presentValidationError(c, parsed.error);
    return presentResult(c, await c.get("container").recomendacionRapida.execute(parsed.data, c.get("contexto")));
  }),

  detalle: safeHandler(async (c) => {
    const parsed = RecomendacionInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return presentValidationError(c, parsed.error);
    return presentResult(c, await c.get("container").recomendacionDetalle.execute(parsed.data, c.get("contexto")));
  }),

  flujo: safeHandler(async (c) => {
    const parsed = RecomendacionInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return presentValidationError(c, parsed.error);
    const container = c.get("container");
    const contexto = c.get("contexto");
    const cancelada = c.req.raw.signal;
    const codificador = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const escritor = writable.getWriter();
    let abierto = true;
    const enviar = (e: EventoRecomendacionDto) => {
      if (!abierto || cancelada.aborted) return;
      escritor.write(codificador.encode(JSON.stringify(e) + "\n")).catch(() => (abierto = false));
    };
    const progreso: IReportadorProgreso = {
      paso: (paso) => enviar({ tipo: "paso", paso }),
      dato: (etiqueta, dato) => enviar({ tipo: "dato", etiqueta, dato }),
    };
    (async () => {
      const rapida = container.recomendacionRapida.execute(parsed.data, contexto, progreso).then((r) =>
        enviar(r.ok ? { tipo: "rapida", datos: r.value } : { tipo: "error", etapa: "rapida", error: { code: r.error.code, message: r.error.message } })
      );
      const detalle = container.recomendacionDetalle.execute(parsed.data, contexto, progreso).then((r) =>
        enviar(r.ok ? { tipo: "detalle", datos: r.value } : { tipo: "error", etapa: "detalle", error: { code: r.error.code, message: r.error.message } })
      );
      await Promise.allSettled([rapida, detalle]);
      enviar({ tipo: "fin" });
    })().catch((error) => {
      console.error("[API] Error técnico en el flujo de recomendación:", error);
      enviar({ tipo: "error", etapa: "detalle", error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" } });
    }).finally(() => {
      abierto = false;
      escritor.close().catch(() => {});
    });
    return new Response(readable, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  }),
};
