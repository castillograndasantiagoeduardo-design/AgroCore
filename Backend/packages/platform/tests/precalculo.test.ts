/**
 * Tests sin red del precálculo regional: decoradores regional/vivo, parseo de REGION_PRECALCULO, clasificación de
 * respuestas de Overpass / subset de ORNL y presencia EVA por departamento (con fetch simulado).
 */
import { assert, assertEquals, assertThrows } from "@std/assert";
import { type ElementosOsm, type LatLon } from "@agrocore/core";
import { Result } from "@agrocore/shared-kernel";
import {
  ClimaPrecalculadoOVivo,
  CoberturaRegionalOVivo,
  ElevacionRegionalOVivo,
  ViasRegionalOVivo,
} from "../src/precalculo/decoradores.ts";
import { parsearRegionPrecalculo, puntoEnCaja, REGION_PRECALCULO_POR_DEFECTO } from "../src/precalculo/region.ts";
import { clasificarRespuestaOverpass, parsearSubsetBloque } from "../src/precalculo/descargas.ts";
import { PresenciaLocalClient } from "../src/presencia/presencia-local-client.ts";

const CAJA = [5.78, -73.04, 5.79, -73.02] as const;
const VACIO: ElementosOsm = { vias: [], edificaciones: [], aguaPoligonos: [], aguaLineas: [], fuente: "x" };
const elementos = (fuente: string): ElementosOsm => ({ ...VACIO, fuente });

// ---------- Decoradores ----------

Deno.test("ViasRegionalOVivo: usa el regional si cubre, el vivo si no cubre o si el regional falla", async () => {
  const llamadas: string[] = [];
  const vivo = { obtenerElementos: () => (llamadas.push("vivo"), Promise.resolve(Result.ok(elementos("vivo")))) };
  const regional = (cubre: boolean, falla = false) => ({
    cubre: () => Promise.resolve(cubre),
    obtenerElementos: () => {
      llamadas.push("regional");
      return Promise.resolve(falla ? Result.err({ code: "X", message: "x" } as never) : Result.ok(elementos("regional")));
    },
  });

  let r = await new ViasRegionalOVivo(regional(true), vivo).obtenerElementos(CAJA);
  assert(r.ok && r.value.fuente === "regional");
  assertEquals(llamadas, ["regional"]);

  llamadas.length = 0;
  r = await new ViasRegionalOVivo(regional(false), vivo).obtenerElementos(CAJA);
  assert(r.ok && r.value.fuente === "vivo");
  assertEquals(llamadas, ["vivo"]); // si no cubre, ni se consulta al regional

  llamadas.length = 0;
  r = await new ViasRegionalOVivo(regional(true, true), vivo).obtenerElementos(CAJA);
  assert(r.ok && r.value.fuente === "vivo");
  assertEquals(llamadas, ["regional", "vivo"]);
});

Deno.test("ViasRegionalOVivo: si cubre() lanza, usa el vivo", async () => {
  const regional = { cubre: () => Promise.reject(new Error("MySQL caído")), obtenerElementos: () => Promise.resolve(Result.ok(elementos("regional"))) };
  const vivo = { obtenerElementos: () => Promise.resolve(Result.ok(elementos("vivo"))) };
  const r = await new ViasRegionalOVivo(regional, vivo).obtenerElementos(CAJA);
  assert(r.ok && r.value.fuente === "vivo");
});

Deno.test("CoberturaRegionalOVivo: regional si cubre, vivo si no", async () => {
  const dato = (fuente: string) => Promise.resolve(Result.ok({ claseIgbp: 10, anio: 2025, fuente }));
  const vivo = { obtenerCobertura: () => dato("vivo") };
  const regional = (cubre: boolean) => ({ cubre: () => Promise.resolve(cubre), obtenerCobertura: () => dato("regional") });
  const a = await new CoberturaRegionalOVivo(regional(true), vivo).obtenerCobertura(5.785, -73.03);
  const b = await new CoberturaRegionalOVivo(regional(false), vivo).obtenerCobertura(5.785, -73.03);
  assert(a.ok && a.value?.fuente === "regional");
  assert(b.ok && b.value?.fuente === "vivo");
});

Deno.test("ElevacionRegionalOVivo: grilla regional solo para UN punto cubierto; varios puntos (pendiente) van en vivo", async () => {
  const resp = (fuente: string, n: number) => Promise.resolve(Result.ok({ fuente, elevacionesM: Array.from({ length: n }, () => 2500 as number | null) }));
  const vivo = { obtenerElevaciones: (p: readonly LatLon[]) => resp("vivo", p.length) };
  const regional = (cubre: boolean) => ({ cubre: () => Promise.resolve(cubre), obtenerElevaciones: (p: readonly LatLon[]) => resp("regional", p.length) });
  const uno = await new ElevacionRegionalOVivo(regional(true), vivo).obtenerElevaciones([[5.785, -73.03]]);
  const varios = await new ElevacionRegionalOVivo(regional(true), vivo).obtenerElevaciones([[5.785, -73.03], [5.7851, -73.03]]);
  const fuera = await new ElevacionRegionalOVivo(regional(false), vivo).obtenerElevaciones([[5.785, -73.03]]);
  assert(uno.ok && uno.value.fuente === "regional");
  assert(varios.ok && varios.value.fuente === "vivo");
  assert(fuera.ok && fuera.value.fuente === "vivo");
});

Deno.test("ElevacionRegionalOVivo: si la grilla no tiene dato (null) usa el vivo", async () => {
  const vivo = { obtenerElevaciones: () => Promise.resolve(Result.ok({ fuente: "vivo", elevacionesM: [2400 as number | null] })) };
  const regional = {
    cubre: () => Promise.resolve(true),
    obtenerElevaciones: () => Promise.resolve(Result.ok({ fuente: "regional", elevacionesM: [null as number | null] })),
  };
  const r = await new ElevacionRegionalOVivo(regional, vivo).obtenerElevaciones([[5.785, -73.03]]);
  assert(r.ok && r.value.fuente === "vivo");
});

Deno.test("ClimaPrecalculadoOVivo: celda precalculada del periodo -> regional; si no hay celda -> vivo", async () => {
  const serie = (fuente: string) => Promise.resolve(Result.ok({ fuente, altitudCeldaM: 2500, registros: [] }));
  const vivo = { obtenerSerieDiaria: () => serie("vivo") };
  const precalculado = (cubre: boolean) => ({ cubre: () => Promise.resolve(cubre), obtenerSerieDiaria: () => serie("precalculo") });
  const consulta = { latitud: 5.785, longitud: -73.03, desde: "1996-01-01", hasta: "2025-12-31" };
  const a = await new ClimaPrecalculadoOVivo(precalculado(true), vivo).obtenerSerieDiaria(consulta);
  const b = await new ClimaPrecalculadoOVivo(precalculado(false), vivo).obtenerSerieDiaria(consulta);
  assert(a.ok && a.value.fuente === "precalculo");
  assert(b.ok && b.value.fuente === "vivo");
});

// ---------- REGION_PRECALCULO ----------

Deno.test("parsearRegionPrecalculo: sin valor usa Colombia (clima) y Boyacá (detalle)", () => {
  assertEquals(parsearRegionPrecalculo(undefined), REGION_PRECALCULO_POR_DEFECTO);
  assertEquals(parsearRegionPrecalculo(""), REGION_PRECALCULO_POR_DEFECTO);
  assertEquals(REGION_PRECALCULO_POR_DEFECTO.clima, [-4.3, -79.1, 12.6, -66.8]);
  assertEquals(REGION_PRECALCULO_POR_DEFECTO.detalle, [4.6, -74.7, 7.15, -71.9]);
});

Deno.test("parsearRegionPrecalculo: formato completo, parcial y espacios", () => {
  const completa = parsearRegionPrecalculo("clima=-4.3,-79.1,12.6,-66.8;detalle=5.5,-73.5,6,-72.5");
  assertEquals(completa.detalle, [5.5, -73.5, 6, -72.5]);
  const parcial = parsearRegionPrecalculo(" detalle = 1, 2, 3, 4 ");
  assertEquals(parcial.detalle, [1, 2, 3, 4]);
  assertEquals(parcial.clima, REGION_PRECALCULO_POR_DEFECTO.clima);
});

Deno.test("parsearRegionPrecalculo: formato inválido lanza (Fail-Fast)", () => {
  assertThrows(() => parsearRegionPrecalculo("clima=1,2,3"), Error, "4 números");
  assertThrows(() => parsearRegionPrecalculo("clima=a,b,c,d"), Error, "4 números");
  assertThrows(() => parsearRegionPrecalculo("otra=1,2,3,4"), Error, "clima=");
  assertThrows(() => parsearRegionPrecalculo("detalle=7,-74,5,-72"), Error, "inválidos");
});

Deno.test("puntoEnCaja: Duitama está en Boyacá; Ames no", () => {
  const { detalle } = REGION_PRECALCULO_POR_DEFECTO;
  assert(puntoEnCaja(5.785, -73.03, detalle));
  assert(!puntoEnCaja(42.008, -93.7, detalle));
});

// ---------- Descargas (parseo puro) ----------

Deno.test("clasificarRespuestaOverpass: conserva el id de OSM y separa vías, edificaciones y agua", () => {
  const g = [{ lat: 1, lon: 2 }, { lat: 1, lon: 3 }, { lat: 2, lon: 3 }, { lat: 1, lon: 2 }];
  const b = clasificarRespuestaOverpass({
    elements: [
      { type: "way", id: 11, tags: { highway: "primary", name: "Ruta 55" }, geometry: g },
      { type: "way", id: 12, tags: { building: "yes" }, geometry: g },
      { type: "way", id: 13, tags: { natural: "water" }, geometry: g },
      { type: "way", id: 14, tags: { waterway: "river" }, geometry: g },
      { type: "way", id: 15, tags: { highway: "track" }, geometry: [{ lat: 1, lon: 2 }] }, // 1 punto: se descarta
      { type: "node", id: 16 },
    ],
  });
  assertEquals(b.vias.map((v) => v.osmId), [11]);
  assertEquals(b.vias[0].nombre, "Ruta 55");
  assertEquals(b.edificaciones.map((e) => e.osmId), [12]);
  assertEquals(b.agua.map((a) => [a.osmId, a.tipo]), [[13, "poligono"], [14, "river"]]);
  assertEquals(b.vias[0].geometria[0], [1, 2]);
});

Deno.test("parsearSubsetBloque: lee la rejilla y valida el tamaño de los datos", () => {
  const ok = parsearSubsetBloque({
    xllcorner: "-8172373.03",
    yllcorner: "549952.16",
    cellsize: 463.31,
    nrows: 2,
    ncols: 2,
    subset: [{ calendar_date: "2025-01-01", data: [10, 9, 255, 300] }],
  });
  assert(ok);
  assertEquals(ok.xll, -8172373.03);
  assertEquals(ok.anio, 2025);
  assertEquals([...ok.datos], [10, 9, 255, 255]); // fuera de 0..255 -> 255 (sin dato)
  assertEquals(parsearSubsetBloque({ nrows: 2, ncols: 2, cellsize: 1, subset: [{ data: [1, 2, 3] }] }), null);
  assertEquals(parsearSubsetBloque(null), null);
});

// ---------- Presencia EVA por departamento ----------

Deno.test("presencia EVA: consulta UNA vez por departamento (2 conjuntos) y la segunda zona sale de la caché", async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((entrada: string | URL | Request) => {
    const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada : entrada.url);
    urls.push(url.hostname + url.pathname + " " + url.searchParams.get("$where"));
    const filas = url.pathname.includes("uejq-wxrr")
      ? [{ mun: "15238", cultivo: "Papa", ha: "100", maxa: "2025" }, { mun: "15238", cultivo: "Mora", ha: "999", maxa: "2025" }]
      : [{ mun: "15238", cultivo: "PAPA", ha: "50", maxa: "2018" }];
    return Promise.resolve(new Response(JSON.stringify(filas), { status: 200 }));
  }) as typeof fetch;
  try {
    const c = new PresenciaLocalClient({ directorioCache: Deno.makeTempDirSync() });
    const r = await c.obtenerPresencia(5.785, -73.03); // Duitama (código 15238)
    assert(r.ok && r.value);
    assertEquals(r.value.fuente, "EVA");
    assertEquals(r.value.periodo, "2015-2025");
    assertEquals(r.value.areaPorCultivo.papa, 13.6); // (100 + 50) ha / 11 años
    assertEquals("mora" in r.value.areaPorCultivo, false); // Mora no es del catálogo
    const antes = urls.length;
    assert(antes >= 2, "al menos una consulta por conjunto");
    assert(urls.every((u) => u.includes("starts_with") || u.includes("between")), "filtra por departamento, no por lista de municipios");

    const r2 = await c.obtenerPresencia(5.80, -73.00); // otro punto de la misma zona: sin red
    assert(r2.ok && r2.value);
    assertEquals(urls.length, antes);
  } finally {
    globalThis.fetch = original;
  }
});
