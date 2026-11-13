/**
 * Tests del módulo terreno con proveedores falsos (sin red).
 */
import { assert, assertEquals } from "@std/assert";
import { PerfilTerrenoSchema } from "@agrocore/contracts";
import { DomainError, Result } from "@agrocore/shared-kernel";
import {
  AnalizarTerrenoUseCase,
  analizarNdvi,
  calcularPendientePct,
  clasificarTextura,
  type ContextoSolicitud,
  type ElementosOsm,
  type ProveedoresTerreno,
  TerrenoProveedorNoDisponibleError,
} from "../../src/index.ts";

const contexto: ContextoSolicitud = { origen: "script", ip: null };
const M = 1 / 111_195; // ~1 m en grados de latitud

/** Autopista recta norte-sur que pasa por longitud 0.001 entre latitudes 0 y 0.01. */
const autopista = { tipo: "motorway", nombre: "Autopista de prueba", geometria: [[0, 0.001], [0.01, 0.001]] as [number, number][] };

function elementos(parcial: Partial<ElementosOsm> = {}): ElementosOsm {
  return { vias: [], edificaciones: [], aguaPoligonos: [], aguaLineas: [], fuente: "OSM falso", ...parcial };
}

/** Serie NDVI de 5 años: verde (0,8) de abril a septiembre, baldío (0,2) el resto. */
function serieEstacional(): { fecha: string; ndvi: number }[] {
  const out: { fecha: string; ndvi: number }[] = [];
  for (let anio = 2021; anio <= 2025; anio++) {
    for (let mes = 1; mes <= 12; mes++) {
      for (const dia of ["01", "17"]) {
        out.push({ fecha: anio + "-" + String(mes).padStart(2, "0") + "-" + dia, ndvi: mes >= 4 && mes <= 9 ? 0.8 : 0.2 });
      }
    }
  }
  return out;
}

function proveedores(cambios: Partial<ProveedoresTerreno> = {}, osm: ElementosOsm = elementos()): ProveedoresTerreno {
  return {
    vias: { obtenerElementos: () => Promise.resolve(Result.ok(osm)) },
    cobertura: { obtenerCobertura: () => Promise.resolve(Result.ok({ claseIgbp: 12, anio: 2023, fuente: "MODIS falso" })) },
    ndvi: { obtenerSerie: () => Promise.resolve(Result.ok({ fuente: "NDVI falso", muestras: serieEstacional() })) },
    suelo: {
      obtenerPropiedades: () =>
        Promise.resolve(Result.ok({
          profundidadCm: "0-30", arenaPct: 40, limoPct: 40, arcillaPct: 20, textura: null, ph: 6.2,
          carbonoOrganicoGKg: 18, nitrogenoGKg: 1.6, fuente: "Suelo falso",
        })),
    },
    elevacion: { obtenerElevaciones: () => Promise.resolve(Result.ok({ fuente: "SRTM falso", elevacionesM: [100, 106, 94, 100, 100] })) },
    humedad: {
      obtenerClimatologia: () =>
        Promise.resolve(Result.ok({
          fuente: "POWER falso",
          meses: Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, superficie: 0.5, raiz: 0.6, perfil: 0.6 })),
        })),
    },
    reloj: { hoy: () => new Date("2026-06-15T12:00:00Z") },
    ...cambios,
  };
}

const caido = <T>() => Promise.resolve(Result.err(new TerrenoProveedorNoDisponibleError("Proveedor X", "timeout")) as Result<T, DomainError>);

Deno.test("terreno: un punto sobre la autopista → no_apto_carretera con el mensaje exacto", async () => {
  const caso = new AnalizarTerrenoUseCase(proveedores({}, elementos({ vias: [autopista] })));
  const r = await caso.execute({ area: { tipo: "punto", latitud: 0.005, longitud: 0.001 + 2 * M } }, contexto);
  assert(r.ok);
  assertEquals(r.value.aptitud, "no_apto_carretera");
  assertEquals(r.value.mensajeAptitud, "No se puede sembrar: es carretera");
  assertEquals(r.value.viasCercanas[0].tipo, "motorway");
  assertEquals(r.value.viasCercanas[0].semiAnchoM, 6);
  PerfilTerrenoSchema.parse(r.value);
});

Deno.test("terreno: a 20 m de la autopista ya no es carretera (semiancho 6 m) y la vía sale como cercana", async () => {
  const caso = new AnalizarTerrenoUseCase(proveedores({}, elementos({ vias: [autopista] })));
  const r = await caso.execute({ area: { tipo: "punto", latitud: 0.005, longitud: 0.001 + 20 * M } }, contexto);
  assert(r.ok);
  assertEquals(r.value.aptitud, "apto");
  assertEquals(r.value.viasCercanas.length, 1);
});

Deno.test("terreno: un área cruzada por una vía excluye ese % y sigue apta", async () => {
  // Cuadrado de ~200 m centrado en la vía (track, semiancho 1 m) → ~1–2 % afectado.
  const via = { tipo: "track", nombre: null, geometria: [[0, 0.001], [0.01, 0.001]] as [number, number][] };
  const caso = new AnalizarTerrenoUseCase(proveedores({}, elementos({ vias: [via] })));
  const d = 100 * M;
  const geojson = {
    type: "Polygon" as const,
    coordinates: [[[0.001 - d, 0.004], [0.001 + d, 0.004], [0.001 + d, 0.004 + 2 * d], [0.001 - d, 0.004 + 2 * d], [0.001 - d, 0.004]]] as [number, number][][],
  };
  const r = await caso.execute({ area: { tipo: "poligono", geojson } }, contexto);
  assert(r.ok);
  assertEquals(r.value.aptitud, "apto");
  assertEquals(r.value.afectacion.puntosMuestreados, 144);
  assert(r.value.afectacion.carreteraPct >= 0 && r.value.afectacion.carreteraPct < 20);
});

Deno.test("terreno: un punto dentro de una edificación → no_apto_edificacion", async () => {
  const casa = [[0, 0], [0, 20 * M], [20 * M, 20 * M], [20 * M, 0]] as [number, number][];
  const caso = new AnalizarTerrenoUseCase(proveedores({}, elementos({ edificaciones: [casa] })));
  const r = await caso.execute({ area: { tipo: "punto", latitud: 10 * M, longitud: 10 * M } }, contexto);
  assert(r.ok);
  assertEquals(r.value.aptitud, "no_apto_edificacion");
});

Deno.test("terreno: MODIS urbano → no_apto_uso_suelo; MODIS agua → no_apto_agua", async () => {
  const urbano = new AnalizarTerrenoUseCase(proveedores({
    cobertura: { obtenerCobertura: () => Promise.resolve(Result.ok({ claseIgbp: 13, anio: 2023, fuente: "MODIS" })) },
  }));
  const a = await urbano.execute({ area: { tipo: "punto", latitud: 1, longitud: 1 } }, contexto);
  assert(a.ok);
  assertEquals(a.value.aptitud, "no_apto_uso_suelo");

  const agua = new AnalizarTerrenoUseCase(proveedores({
    cobertura: { obtenerCobertura: () => Promise.resolve(Result.ok({ claseIgbp: 17, anio: 2023, fuente: "MODIS" })) },
  }));
  const b = await agua.execute({ area: { tipo: "punto", latitud: 1, longitud: 1 } }, contexto);
  assert(b.ok);
  assertEquals(b.value.aptitud, "no_apto_agua");
});

Deno.test("terreno: suelo, pendiente y NDVI (meses baldíos de octubre a marzo)", async () => {
  const r = await new AnalizarTerrenoUseCase(proveedores()).execute({ area: { tipo: "punto", latitud: 42, longitud: -93.7 } }, contexto);
  assert(r.ok);
  assertEquals(r.value.suelo?.textura, "franca");
  assertEquals(r.value.pendientePct, 20); // (106 − 94) / 60 m = 20 %
  assertEquals(r.value.elevacionM, 100);
  assertEquals(r.value.ndvi?.mesesBaldios, [1, 2, 3, 10, 11, 12]);
  assertEquals(r.value.ndvi?.estres.mesesConEstres, []);
  assert(r.value.fuentes.length >= 5);
});

Deno.test("terreno: con TODOS los proveedores caídos el perfil sale igual, con advertencias y vacíos (nunca error)", async () => {
  const caso = new AnalizarTerrenoUseCase(proveedores({
    vias: { obtenerElementos: () => caido() },
    cobertura: { obtenerCobertura: () => caido() },
    ndvi: { obtenerSerie: () => caido() },
    suelo: { obtenerPropiedades: () => caido() },
    elevacion: { obtenerElevaciones: () => caido() },
    humedad: { obtenerClimatologia: () => caido() },
  }));
  const r = await caso.execute({ area: { tipo: "punto", latitud: -0.3, longitud: 36.08 } }, contexto);
  assert(r.ok);
  assertEquals(r.value.aptitud, "apto");
  assertEquals(r.value.suelo, null);
  assertEquals(r.value.ndvi, null);
  assert(r.value.advertencias.length >= 6);
  assert(r.value.vaciosInformacion.some((v) => v.includes("NDVI")));
  PerfilTerrenoSchema.parse(r.value);
});

Deno.test("terreno: un área de más de 100 ha es un error de dominio (AREA_DEMASIADO_GRANDE)", async () => {
  const d = 0.02;
  const geojson = { type: "Polygon" as const, coordinates: [[[0, 0], [d, 0], [d, d], [0, d], [0, 0]]] as [number, number][][] };
  const r = await new AnalizarTerrenoUseCase(proveedores()).execute({ area: { tipo: "poligono", geojson } }, contexto);
  assertEquals(!r.ok && r.error.code, "AREA_DEMASIADO_GRANDE");
});

Deno.test("ndvi: un lote siempre verde no tiene meses baldíos y detecta estrés reciente", () => {
  const muestras = serieEstacional().map((m) => ({ ...m, ndvi: 0.7 }));
  // Último año (2025) muy seco de junio a agosto.
  for (const m of muestras) if (m.fecha >= "2025-06" && m.fecha < "2025-09") m.ndvi = 0.4;
  const r = analizarNdvi(muestras, "x", "2021-01-01", "2025-12-31");
  assertEquals(r.mesesBaldios, []);
  assertEquals(r.estres.mesesConEstres, [6, 7, 8]);
});

Deno.test("suelo y relieve: textura simplificada y pendiente", () => {
  assertEquals(clasificarTextura(20, 45), "arcillosa");
  assertEquals(clasificarTextura(85, 5), "arenosa");
  assertEquals(clasificarTextura(40, 20), "franca");
  assertEquals(clasificarTextura(null, 20), null);
  assertEquals(calcularPendientePct([100, 100, 100, 100, 100]), 0);
  assertEquals(calcularPendientePct([100, null, 100, 100, 100]), null);
});
