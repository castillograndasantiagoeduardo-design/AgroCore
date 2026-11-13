/**
 * Tests de la Fase 4: ET0 (Hargreaves), temporadas de cultivo derivadas, régimen de lluvias y
 * calendario de vulnerabilidad, en climas muy distintos (sin red).
 */
import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import type { ClimaMensualDto } from "@agrocore/contracts";
import {
  calcularCalendarioVulnerabilidad,
  calcularTemporadasCultivo,
  et0MensualMm,
  indiceAridez,
  mesesCriticos,
  radiacionExtraterrestre,
  regimenLluvias,
} from "../../src/index.ts";

const NOMBRES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Perfil mensual sintético a partir de 12 temperaturas medias y 12 lluvias. */
function meses(latitud: number, tMedia: number[], lluvia: number[], opciones: { amplitud?: number; heladas?: number[]; calor?: number[] } = {}): ClimaMensualDto[] {
  const amp = opciones.amplitud ?? 10;
  const promedio = lluvia.reduce((a, b) => a + b, 0) / 12;
  return tMedia.map((t, i) => {
    const etoMm = Math.round(et0MensualMm(latitud, i + 1, t, t - amp / 2, t + amp / 2));
    const helada = opciones.heladas?.includes(i + 1) ?? false;
    return {
      mes: i + 1,
      nombreMes: NOMBRES[i],
      lluviaMm: lluvia[i],
      tempMediaC: t,
      tempMinC: t - amp / 2,
      tempMaxC: t + amp / 2,
      diasHeladaPromedio: helada ? 20 : 0,
      probabilidadHelada: helada ? 1 : 0,
      diasLluviaFuertePromedio: lluvia[i] > 150 ? 3 : 0,
      diasCalorPromedio: opciones.calor?.includes(i + 1) ? 15 : 0,
      etoMm,
      balanceHidricoMm: lluvia[i] - etoMm,
      temporada: lluvia[i] >= promedio ? "lluviosa" : "seca",
    };
  });
}

// Climas de referencia (valores típicos, no de una estación concreta)
const duitama = meses(5.8, [13, 13.5, 14, 14, 14, 13.5, 13, 13, 13.5, 14, 14, 13.5], [30, 40, 80, 120, 110, 50, 35, 40, 60, 120, 120, 75]);
const iowa = meses(42, [-7, -4, 3, 10, 16, 22, 24, 23, 18, 11, 3, -4], [20, 25, 55, 90, 120, 120, 105, 105, 85, 65, 50, 30], {
  heladas: [1, 2, 3, 11, 12],
});
const cordoba = meses(37.85, [10, 11.5, 14, 16, 20, 25, 28, 28, 24, 19, 13.5, 10.5], [65, 55, 45, 55, 40, 12, 3, 5, 25, 70, 85, 90], {
  amplitud: 14,
  calor: [6, 7, 8, 9],
});
const patagonia = meses(-43.3, [21, 20, 17, 13, 9, 6, 6, 7, 10, 14, 17, 20], [15, 15, 15, 15, 20, 20, 15, 15, 15, 15, 15, 15], {
  heladas: [6, 7],
});

Deno.test("ET0: radiación extraterrestre y Hargreaves dan valores del orden esperado", () => {
  // FAO-56, ejemplo 8: latitud −20°, 3 de septiembre (día 246) → Ra = 32,2 MJ m⁻² día⁻¹
  assertAlmostEquals(radiacionExtraterrestre(-20, 246), 32.2, 0.2);
  // Córdoba en julio: ~6–7 mm/día → ~180–230 mm/mes
  const julio = et0MensualMm(37.85, 7, 28, 19, 37);
  assert(julio > 170 && julio < 240, "ET0 julio Córdoba " + julio);
});

Deno.test("Temporadas: Duitama (bimodal) tiene 2 temporadas de secano", () => {
  const t = calcularTemporadasCultivo(duitama);
  assertEquals(regimenLluvias(duitama), "bimodal");
  assertEquals(t.secano.length, 2);
  assertEquals(t.conRiego.length, 2); // todo el año apto térmicamente → se divide en dos
});

Deno.test("Temporadas: Iowa tiene UNA temporada (primavera–otoño) y el invierno queda fuera", () => {
  const t = calcularTemporadasCultivo(iowa);
  assertEquals(t.secano.length, 1);
  const temporada = t.secano[0];
  assert(temporada.inicioMes >= 4 && temporada.inicioMes <= 5, "inicio " + temporada.inicioMes);
  assert(!temporada.meses.includes(1) && !temporada.meses.includes(12));
  assertEquals(regimenLluvias(iowa), "unimodal");
});

Deno.test("Temporadas: Córdoba (verano seco) siembra en otoño–invierno en secano y tiene déficit hídrico en verano", () => {
  const t = calcularTemporadasCultivo(cordoba);
  assertEquals(t.secano.length, 1);
  assert(t.secano[0].meses.includes(12) && t.secano[0].meses.includes(1), "la temporada cruza diciembre → enero");
  assert(!t.secano[0].meses.includes(7));
  const criticos = mesesCriticos(cordoba);
  for (const mes of [6, 7, 8]) assert(criticos.mesesDeficitHidrico.includes(mes));
  assertEquals(criticos.mesesCalor, [6, 7, 8, 9]);
  // Con riego, todo el año es apto térmicamente → dos temporadas (invierno y verano).
  assertEquals(t.conRiego.length, 2);
});

Deno.test("Temporadas: en el hemisferio sur la temporada cálida cruza el cambio de año", () => {
  const t = calcularTemporadasCultivo(patagonia);
  assertEquals(regimenLluvias(patagonia), "arido");
  assert(indiceAridez(patagonia) < 0.2);
  // Sin lluvia suficiente no hay secano; con riego, la temporada cálida va de primavera a otoño austral.
  assertEquals(t.secano.length, 0);
  const conRiego = t.conRiego.flatMap((x) => x.meses);
  assert(conRiego.includes(12) && conRiego.includes(1), "el verano austral (dic–ene) es apto con riego");
  assertEquals(t.conRiego.length, 2); // 10 meses aptos seguidos (ago → may) se dividen en dos temporadas
  assert(!t.conRiego.some((x) => x.meses.includes(6) || x.meses.includes(7)));
});

Deno.test("Vulnerabilidad: helada en el invierno de Iowa y calor + déficit en el verano de Córdoba", () => {
  const iowaV = calcularCalendarioVulnerabilidad(iowa);
  assertEquals(iowaV.length, 12);
  assert(iowaV[0].amenazas.some((a) => a.tipo === "helada" && a.severidad === "alta"));
  assert(!iowaV[6].amenazas.some((a) => a.tipo === "helada"), "julio sin helada en Iowa");

  const cordobaV = calcularCalendarioVulnerabilidad(cordoba);
  const julio = cordobaV[6];
  assert(julio.amenazas.some((a) => a.tipo === "calor" && a.severidad === "alta"));
  assert(julio.amenazas.some((a) => a.tipo === "deficit_hidrico" && a.severidad === "alta"));
});
