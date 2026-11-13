/**
 * Parte de interfaz de cargas-sin-bloqueo (fase 2.7): la pantalla siempre sale del estado de carga.
 * Se ejecuta con Deno desde Backend/ (deno task test).
 */
import { assert, assertEquals } from "@std/assert";
import { ESTADO_INICIAL, estaCargando, reducirCarga } from "./estado-carga.ts";

const paso = { id: "vias" as const, nombre: "Revisando si hay vías o construcciones", estado: "listo" as const };

Deno.test("UI: un proveedor que nunca responde → el vigilante avisa y Cancelar sale de la carga", () => {
  let e = reducirCarga(ESTADO_INICIAL, { tipo: "iniciar", id: 1 });
  e = reducirCarga(e, { tipo: "evento", id: 1, evento: { tipo: "paso", paso } });
  assert(estaCargando(e));
  e = reducirCarga(e, { tipo: "vigilante", id: 1 });
  assertEquals(e.tardando, true, "a los 30 s debe mostrar 'Esto está tardando más de lo normal'");
  e = reducirCarga(e, { tipo: "cancelar" });
  assertEquals(estaCargando(e), false);
  assertEquals(e.fase, "inactivo");
});

Deno.test("UI: el flujo se corta sin resultado → error con Reintentar (nunca spinner infinito)", () => {
  let e = reducirCarga(ESTADO_INICIAL, { tipo: "iniciar", id: 7 });
  e = reducirCarga(e, { tipo: "cerrado", id: 7 });
  assertEquals(e.fase, "error");
  assert(e.error?.message.length);
});

Deno.test("UI: llega la etapa rápida y el detalle falla → resultado parcial", () => {
  let e = reducirCarga(ESTADO_INICIAL, { tipo: "iniciar", id: 2 });
  e = reducirCarga(e, { tipo: "evento", id: 2, evento: { tipo: "rapida", datos: { epocas: [] } as never } });
  assertEquals(e.fase, "rapida_lista");
  e = reducirCarga(e, { tipo: "evento", id: 2, evento: { tipo: "error", etapa: "detalle", error: { code: "X", message: "falló" } } });
  e = reducirCarga(e, { tipo: "evento", id: 2, evento: { tipo: "fin" } });
  assertEquals(e.fase, "parcial");
  assertEquals(estaCargando(e), false);
});

Deno.test("UI: cambiar de punto mientras carga descarta los eventos de la petición vieja", () => {
  let e = reducirCarga(ESTADO_INICIAL, { tipo: "iniciar", id: 3 });
  e = reducirCarga(e, { tipo: "iniciar", id: 4 });
  e = reducirCarga(e, { tipo: "evento", id: 3, evento: { tipo: "rapida", datos: { vieja: true } as never } });
  assertEquals(e.rapida, null, "un evento tardío de la petición anterior no puede pintar resultados");
  e = reducirCarga(e, { tipo: "fallo_red", id: 4, mensaje: "Sin conexión" });
  assertEquals(e.fase, "error");
});
