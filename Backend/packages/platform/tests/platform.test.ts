import { assertEquals } from "@std/assert";
import { Result } from "@agrocore/shared-kernel";
import { CacheEnMemoria, normalizarClave, obtenerConCache } from "../src/cache/cache-en-memoria.ts";
import { parsearRespuestaOverpass } from "../src/overpass-vias-client.ts";
import { parsearSubsetCobertura, parsearSubsetNdvi } from "../src/ornl-modis-client.ts";
import { parsearRespuestaSoilGrids } from "../src/soilgrids-client.ts";
import { parsearHumedadPower } from "../src/nasa-power-humedad-client.ts";

const geo = [{ lat: 5.0, lon: -73.0 }, { lat: 5.1, lon: -73.1 }, { lat: 5.0, lon: -73.0 }];

Deno.test("Overpass: clasifica vias, edificaciones, agua y ejes", () => {
  const r = parsearRespuestaOverpass({
    elements: [
      { type: "way", tags: { highway: "primary", ref: "55" }, geometry: geo },
      { type: "way", tags: { highway: "track", name: "Camino" }, geometry: geo },
      { type: "way", tags: { building: "yes" }, geometry: geo },
      { type: "way", tags: { natural: "water" }, geometry: geo },
      { type: "way", tags: { landuse: "reservoir" }, geometry: geo },
      { type: "way", tags: { waterway: "river" }, geometry: geo },
      { type: "node", id: 1 },
    ],
  });
  assertEquals(r.vias.map((v) => v.nombre), ["55", "Camino"]);
  assertEquals(r.edificaciones.length, 1);
  assertEquals(r.aguaPoligonos.length, 2);
  assertEquals(r.aguaLineas[0].tipo, "river");
  assertEquals(r.vias[0].geometria[0], [5.0, -73.0]);
});

Deno.test("SoilGrids: aplica d_factor y pondera por espesor", () => {
  const capa = (name: string, d_factor: number, a: number | null, b: number | null, c: number | null) => ({
    name,
    unit_measure: { d_factor },
    depths: [
      { label: "0-5cm", values: { mean: a } },
      { label: "5-15cm", values: { mean: b } },
      { label: "15-30cm", values: { mean: c } },
    ],
  });
  const s = parsearRespuestaSoilGrids({
    properties: { layers: [capa("sand", 10, 400, 400, 400), capa("phh2o", 10, 50, 50, 56), capa("soc", 10, null, null, null)] },
  });
  assertEquals(s?.arenaPct, 40);
  assertEquals(s?.ph, 5.3); // (5*5 + 5*10 + 5.6*15)/30
  assertEquals(s?.carbonoOrganicoGKg, null);
  assertEquals(s?.textura, null);
  assertEquals(parsearRespuestaSoilGrids({ properties: { layers: [capa("sand", 10, null, null, null)] } }), null);
});

Deno.test("NDVI: escala 0.0001 y descarta relleno -3000 y fuera de rango", () => {
  const m = parsearSubsetNdvi({
    subset: [
      { calendar_date: "2020-01-01", data: [6500] },
      { calendar_date: "2020-01-17", data: [-3000] },
      { calendar_date: "2020-02-02", data: [15000] },
    ],
  });
  assertEquals(m, [{ fecha: "2020-01-01", ndvi: 0.65 }]);
});

Deno.test("Cobertura: toma el ultimo registro valido", () => {
  const c = parsearSubsetCobertura({
    subset: [{ calendar_date: "2022-01-01", data: [13] }, { calendar_date: "2023-01-01", data: [255] }],
  });
  assertEquals(c, { claseIgbp: 13, anio: 2022 });
});

Deno.test("Humedad: -999 pasa a null y devuelve 12 meses", () => {
  const meses = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const serie = (v: number) => Object.fromEntries(meses.map((m) => [m, v]));
  const r = parsearHumedadPower({
    header: { fill_value: -999 },
    properties: { parameter: { GWETTOP: serie(0.5), GWETROOT: serie(-999), GWETPROF: serie(0.7) } },
  });
  assertEquals(r?.length, 12);
  assertEquals(r?.[0], { mes: 1, superficie: 0.5, raiz: null, perfil: 0.7 });
});

Deno.test("Cache: TTL, limite de entradas y obtenerConCache solo guarda ok", async () => {
  const mem = new CacheEnMemoria(2);
  mem.guardar("a", 1, 1);
  mem.guardar("b", 2, 1);
  mem.guardar("c", 3, 1);
  assertEquals(mem.obtener("a"), null);
  assertEquals(mem.obtener("c"), 3);
  mem.guardar("x", 9, -1);
  assertEquals(mem.obtener("x"), null);

  const m2 = new CacheEnMemoria();
  let llamadas = 0;
  const guardados: string[] = [];
  const persistente = {
    obtener: () => Promise.reject(new Error("caída")),
    guardar: (k: string) => {
      guardados.push(k);
      return Promise.resolve();
    },
  };
  const cargar = () => {
    llamadas++;
    return Promise.resolve(Result.ok(42));
  };
  await obtenerConCache("k", "p", 1, m2, persistente as never, cargar);
  const r = await obtenerConCache("k", "p", 1, m2, persistente as never, cargar);
  assertEquals(r.ok && r.value, 42);
  assertEquals(llamadas, 1);
  assertEquals(guardados, ["k"]);

  const largo = await normalizarClave("z".repeat(200));
  assertEquals(largo.length <= 180, true);
});
