/**
 * Fase 2.7 — que nunca se quede trabado: un proveedor que NUNCA responde no puede dejar la petición colgada.
 * Se usa un temporizador acelerado (1 ms real por cada 500 ms simulados): el plazo de 25 s se cumple en ~50 ms reales,
 * y además se mide el tiempo real para comprobar que la respuesta llega en menos de 25 s.
 * (La parte de la interfaz está en Frontend/src/features/recomendacion/estado-carga.test.ts.)
 */
import { assert, assertEquals } from "@std/assert";
import { Result } from "@agrocore/shared-kernel";
import { PLAZO_MAXIMO_PETICION_MS } from "@agrocore/contracts";
import { RecomendarPorEpocaUseCase } from "../../src/modules/recomendacion/application/use-cases/recomendar-por-epoca.use-case.ts";
import { RecomendacionDetalleUseCase } from "../../src/modules/recomendacion/application/use-cases/recomendacion-detalle.use-case.ts";
import { MESES_DUITAMA, perfilSintetico, PRESENCIA_DUITAMA, repoCultivos } from "./_fixtures.ts";

const nunca = <T>() => new Promise<T>(() => {});
const temporizadorAcelerado = { esperar: (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(1, Math.round(ms / 500)))) };
const reloj = { hoy: () => new Date("2026-11-13T12:00:00Z") };
const contexto = { origen: "script" as const, ip: null };
const entrada = { area: { tipo: "punto" as const, latitud: 5.785, longitud: -73.03 }, cultivoActual: "papa", tieneRiego: false, objetivo: "equilibrado" as const };

Deno.test("etapa rápida: OpenStreetMap y MODIS nunca responden → responde antes del plazo, con advertencia y el paso 'No disponible'", async () => {
  const perfil = await perfilSintetico(MESES_DUITAMA, 5.785, 2530);
  const uc = new RecomendarPorEpocaUseCase({
    vias: { obtenerElementos: () => nunca() },
    cobertura: { obtenerCobertura: () => nunca() },
    elevacion: { obtenerElevaciones: () => nunca() },
    clima: { porUbicacionRapida: () => Promise.resolve(Result.ok({ perfil, origen: "serie_diaria" as const })) },
    presencia: { obtenerPresencia: () => Promise.resolve(Result.ok(PRESENCIA_DUITAMA)) },
    cultivos: repoCultivos(),
    temporizador: temporizadorAcelerado,
    reloj,
  });
  const inicio = performance.now();
  const r = await uc.execute(entrada, contexto);
  const ms = performance.now() - inicio;
  assert(ms < PLAZO_MAXIMO_PETICION_MS, "tardó " + ms + " ms");
  assert(r.ok);
  assertEquals(r.value.aptitud.viasVerificadas, false);
  assert(r.value.advertencias.some((a) => a.includes("OpenStreetMap")), r.value.advertencias.join(" | "));
  assertEquals(r.value.pasos.find((p) => p.id === "vias")?.estado, "no_disponible");
  assertEquals(r.value.pasos.find((p) => p.id === "recomendacion")?.estado, "listo");
  // Sin elevación SRTM: la altitud sale de la celda de NASA y se rotula como estimada (no se inventa).
  assertEquals(r.value.resumenClima.altitudM.tipo, "estimado");
  assert(r.value.epocas.length > 0);
});

Deno.test("etapa rápida: NASA POWER nunca responde → error controlado antes del plazo (no se queda cargando)", async () => {
  const uc = new RecomendarPorEpocaUseCase({
    vias: { obtenerElementos: () => Promise.resolve(Result.ok({ vias: [], edificaciones: [], aguaPoligonos: [], aguaLineas: [], fuente: "OSM" })) },
    cobertura: { obtenerCobertura: () => Promise.resolve(Result.ok(null)) },
    elevacion: { obtenerElevaciones: () => Promise.resolve(Result.ok({ fuente: "SRTM", elevacionesM: [2530] })) },
    clima: { porUbicacionRapida: () => nunca() },
    presencia: { obtenerPresencia: () => nunca() },
    cultivos: repoCultivos(),
    temporizador: temporizadorAcelerado,
    reloj,
  });
  const inicio = performance.now();
  const r = await uc.execute(entrada, contexto);
  assert(performance.now() - inicio < PLAZO_MAXIMO_PETICION_MS);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "RECOMENDACION_SIN_CLIMA");
});

Deno.test("detalle: el análisis del terreno nunca termina → responde con lo que hay y advertencias", async () => {
  const perfil = await perfilSintetico(MESES_DUITAMA, 5.785, 2530);
  const uc = new RecomendacionDetalleUseCase({
    terreno: { analizar: () => nunca() },
    clima: { porUbicacion: () => Promise.resolve(Result.ok(perfil)) },
    presencia: { obtenerPresencia: () => Promise.resolve(Result.ok(PRESENCIA_DUITAMA)) },
    cultivos: repoCultivos(),
    motor: { comparar: () => nunca() } as never,
    temporizador: temporizadorAcelerado,
    reloj,
  });
  const inicio = performance.now();
  const r = await uc.execute(entrada, contexto);
  assert(performance.now() - inicio < PLAZO_MAXIMO_PETICION_MS);
  assert(r.ok);
  assert(r.value.advertencias.some((a) => a.includes("no terminó a tiempo")));
  assertEquals(r.value.terreno.suelo.ph.valor, null, "sin suelo no puede aparecer un pH");
  assertEquals(r.value.climaMensual.length, 12);
  assertEquals(r.value.pasos.find((p) => p.id === "suelo")?.estado, "no_disponible");
});
