/**
 * Tests del value object AreaSeleccionada, de la geometría plana y de la clasificación climática.
 */
import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { AreaSeleccionada, clasificarClima, distanciaAPolilineaM, distanciaM, puntoEnPoligono } from "../../src/index.ts";

/** Cuadrado de `ladoM` metros con esquina suroeste en (lat, lon), en GeoJSON [lon, lat]. */
function cuadrado(lat: number, lon: number, ladoM: number): [number, number][] {
  const dLat = ladoM / 111_195;
  const dLon = ladoM / (111_195 * Math.cos((lat * Math.PI) / 180));
  return [[lon, lat], [lon + dLon, lat], [lon + dLon, lat + dLat], [lon, lat + dLat], [lon, lat]];
}

Deno.test("AreaSeleccionada.punto valida rangos de coordenadas", () => {
  assertEquals(AreaSeleccionada.punto(-43.3, -65.1).ok, true);
  const malo = AreaSeleccionada.punto(91, 0);
  assertEquals(malo.ok, false);
  if (!malo.ok) assertEquals(malo.error.code, "AREA_INVALIDA");
});

Deno.test("AreaSeleccionada.poligono calcula hectáreas y centroide (cuadrado de 300 m ≈ 9 ha, India)", () => {
  const r = AreaSeleccionada.poligono({ type: "Polygon", coordinates: [cuadrado(30.9, 75.85, 300)] });
  assert(r.ok);
  assertAlmostEquals(r.value.areaHa!, 9, 0.1);
  assertAlmostEquals(r.value.latitud, 30.9 + 150 / 111_195, 1e-5);
  assertEquals(r.value.resumen().hemisferio, "norte");
});

Deno.test("AreaSeleccionada.poligono acepta el anillo abierto y en el hemisferio sur (Patagonia)", () => {
  const anillo = cuadrado(-43.3, -65.1, 100).slice(0, 4);
  const r = AreaSeleccionada.poligono({ type: "Polygon", coordinates: [anillo] });
  assert(r.ok);
  assertEquals(r.value.resumen().hemisferio, "sur");
  assertAlmostEquals(r.value.areaHa!, 1, 0.05);
});

Deno.test("AreaSeleccionada.poligono rechaza más de 100 ha, menos de 3 vértices y lados cruzados", () => {
  const grande = AreaSeleccionada.poligono({ type: "Polygon", coordinates: [cuadrado(-0.3, 36.08, 1100)] });
  assertEquals(!grande.ok && grande.error.code, "AREA_DEMASIADO_GRANDE");

  const pocos = AreaSeleccionada.poligono({ type: "Polygon", coordinates: [[[0, 0], [0.001, 0], [0, 0]]] });
  assertEquals(!pocos.ok && pocos.error.code, "AREA_INVALIDA");

  // "Corbatín": los lados 1-2 y 3-4 se cruzan.
  const corbatin = AreaSeleccionada.poligono({ type: "Polygon", coordinates: [[[0, 0], [0.001, 0.001], [0.001, 0], [0, 0.001], [0, 0]]] });
  assertEquals(!corbatin.ok && corbatin.error.code, "AREA_INVALIDA");
});

Deno.test("puntosMuestreo devuelve una malla dentro del polígono", () => {
  const r = AreaSeleccionada.poligono({ type: "Polygon", coordinates: [cuadrado(37.85, -4.85, 400)] });
  assert(r.ok);
  const puntos = r.value.puntosMuestreo(10);
  assertEquals(puntos.length, 100);
  assert(puntos.every((p) => r.value.contiene(p)));
});

Deno.test("geometría: distancia a una polilínea y punto en polígono", () => {
  // Vía recta este-oeste en el ecuador; un punto 10 m al norte.
  const via = [[0, 0], [0, 0.01]] as const;
  const p = [10 / 111_195, 0.005] as const;
  assertAlmostEquals(distanciaAPolilineaM(p, via), 10, 0.1);
  assertAlmostEquals(distanciaM([0, 0], [0, 1]), 111_195, 50);
  assert(puntoEnPoligono([0.5, 0.5], [[0, 0], [0, 1], [1, 1], [1, 0]]));
  assert(!puntoEnPoligono([1.5, 0.5], [[0, 0], [0, 1], [1, 1], [1, 0]]));
});

Deno.test("clasificarClima: tropical, de altura, subtropical, templado y frío", () => {
  const constante = (t: number) => Array(12).fill(t);
  assertEquals(clasificarClima(constante(26), 5), "tropical"); // costa caribe
  assertEquals(clasificarClima([13, 13.5, 14, 14, 14, 13.5, 13, 13, 13.5, 14, 14, 13.5], 5.8), "de_altura"); // Duitama
  assertEquals(clasificarClima([12, 13, 15, 18, 22, 26, 28, 28, 25, 20, 15, 12], 30), "subtropical");
  assertEquals(clasificarClima([9, 11, 13, 16, 20, 25, 28, 28, 24, 18, 13, 10], 37.85), "templado"); // Córdoba
  assertEquals(clasificarClima([-7, -5, 2, 9, 16, 21, 23, 22, 18, 11, 3, -4], 42), "frio"); // Iowa
});
