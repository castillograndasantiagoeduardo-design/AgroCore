/**
 * Tests de detalle del motor de rotaciones: ventanas, ponderación, continuaciones,
 * riego, explicaciones, calendario, oportunidades y determinismo (sin red ni MySQL).
 */
import { assert, assertEquals } from "@std/assert";
import type { PerfilClimaticoDto } from "@agrocore/contracts";
import { Result } from "@agrocore/shared-kernel";
import {
  AreaSeleccionada,
  calcularCalendarioVulnerabilidad,
  calcularPuntajeTotal,
  calcularTemporadasCultivo,
  CompararRotacionesUbicacionUseCase,
  construirVentanas,
  type ContextoMotor,
  type ContextoSolicitud,
  type Cultivo,
  et0MensualMm,
  evaluarPaso,
  evaluarSecuencia,
  type IAnalisisTerrenoQuery,
  mejorCoberturaPara,
  mesesDesde,
  mesesEntre,
  MotorRotaciones,
} from "../../src/index.ts";
import { cultivoDePrueba } from "../_fixtures/cultivos.ts";

const NOMBRES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const contexto: ContextoSolicitud = { origen: "script", ip: null };
const PRIORIDADES = { agua: 3, suelo: 3, plagas: 3, forraje: 3, ingreso: 3 };

function perfil(latitud: number, temp: number[], lluvia: number[], heladas: number[] = []): PerfilClimaticoDto {
  const promedio = lluvia.reduce((a, b) => a + b, 0) / 12;
  const meses = temp.map((t, i) => {
    const etoMm = Math.round(et0MensualMm(latitud, i + 1, t, t - 5, t + 5));
    const h = heladas.includes(i + 1);
    return {
      mes: i + 1, nombreMes: NOMBRES[i], lluviaMm: lluvia[i], tempMediaC: t, tempMinC: t - 5, tempMaxC: t + 5,
      diasHeladaPromedio: h ? 6 : 0, probabilidadHelada: h ? 0.6 : 0, diasLluviaFuertePromedio: 0, diasCalorPromedio: 0,
      etoMm, balanceHidricoMm: lluvia[i] - etoMm, temporada: (lluvia[i] >= promedio ? "lluviosa" : "seca") as "lluviosa" | "seca",
    };
  });
  return {
    latitud, longitud: 0, altitudReferenciaM: 500, altitudCeldaM: 500, ajusteTemperaturaC: 0,
    periodo: { desde: "1996-01-01", hasta: "2025-12-31", anios: 30 }, fuente: "NASA POWER (sintético)", calibracion: null,
    umbrales: { heladaC: 2, lluviaFuerteMm: 20, calorC: 32 }, meses,
    resumen: {
      lluviaAnualMm: lluvia.reduce((a, b) => a + b, 0), tempMediaAnualC: temp.reduce((a, b) => a + b, 0) / 12,
      etoAnualMm: meses.reduce((s, m) => s + m.etoMm, 0), indiceAridez: 0.5, regimenLluvias: "unimodal",
      mesesLluviosos: [], mesesSecos: [], mesesRiesgoHelada: heladas, mesesCalor: [],
      mesesDeficitHidrico: meses.filter((m) => m.lluviaMm < 0.5 * m.etoMm).map((m) => m.mes), mesesLluviaExtrema: [],
      clasificacionClimatica: "templado",
    },
    temporadasCultivo: calcularTemporadasCultivo(meses),
    calendarioVulnerabilidad: calcularCalendarioVulnerabilidad(meses),
    advertencias: [],
  };
}

/** Mediterráneo: lluvia de otoño a primavera, verano seco y caluroso. */
const MEDITERRANEO = perfil(37.8, [9, 10, 13, 15, 19, 24, 28, 28, 24, 18, 13, 10], [70, 60, 55, 50, 35, 10, 2, 5, 25, 70, 80, 90], [1]);
/** Trópico húmedo cálido sin estación seca (todo el año apto). */
const TROPICO = perfil(3, Array(12).fill(26), Array(12).fill(200));

const trigo = cultivoDePrueba({
  clave: "trigo", nombre: "Trigo", familias: ["poaceas"], grupo: "cereal", cicloDias: [150, 180],
  temperaturaOptimaC: [10, 22], temperaturaAbsolutaC: [3, 30], toleranciaHelada: "alta", necesidadAgua: "media", aguaCicloMm: [250, 450],
});
const garbanzo = cultivoDePrueba({
  clave: "garbanzo", nombre: "Garbanzo", familias: ["fabaceas"], grupo: "leguminosa", fijaNitrogeno: true, cicloDias: [120, 150],
  temperaturaOptimaC: [12, 24], temperaturaAbsolutaC: [4, 32], toleranciaHelada: "media", toleranciaSequia: "alta",
  necesidadAgua: "baja", aguaCicloMm: [200, 350],
});
const vicia = cultivoDePrueba({
  clave: "vicia_villosa", nombre: "Vicia", familias: ["fabaceas"], grupo: "cobertura", uso: "cobertura", fijaNitrogeno: true,
  cicloDias: [90, 120], temperaturaOptimaC: [8, 20], temperaturaAbsolutaC: [0, 28], toleranciaHelada: "alta", aguaCicloMm: [150, 300],
  coberturaSuelo: "alta",
});
const colza = cultivoDePrueba({
  clave: "colza", nombre: "Colza", familias: ["brasicaceas"], grupo: "oleaginosa", cicloDias: [150, 180],
  temperaturaOptimaC: [8, 20], temperaturaAbsolutaC: [2, 28], toleranciaHelada: "alta", necesidadAgua: "media", aguaCicloMm: [250, 400],
});
const yuca = cultivoDePrueba({
  clave: "yuca", nombre: "Yuca", familias: ["euforbiaceas"], grupo: "tuberculo", cicloDias: [270, 330], ocupaVariasTemporadas: true,
  temperaturaOptimaC: [20, 29], temperaturaAbsolutaC: [15, 35], aguaCicloMm: [800, 1200], toleranciaSequia: "alta",
});
const frijol = cultivoDePrueba({
  clave: "frijol", nombre: "Frijol", familias: ["fabaceas"], grupo: "leguminosa", fijaNitrogeno: true, cicloDias: [80, 100],
  temperaturaOptimaC: [18, 28], temperaturaAbsolutaC: [12, 32], aguaCicloMm: [300, 450],
});
const pradera = cultivoDePrueba({
  clave: "raigras_trebol", nombre: "Pradera", familias: ["poaceas", "fabaceas"], grupo: "forraje", uso: "forraje", perenne: true,
  fijaNitrogeno: true, cicloDias: [365, 1825], temperaturaOptimaC: [10, 30], temperaturaAbsolutaC: [2, 34],
  toleranciaHelada: "alta", aguaCicloMm: [600, 1000], coberturaSuelo: "alta", valorForrajero: "alto",
});
const maizTropical = cultivoDePrueba({
  clave: "maiz", nombre: "Maíz", familias: ["poaceas"], grupo: "cereal", cicloDias: [100, 120],
  temperaturaOptimaC: [20, 32], temperaturaAbsolutaC: [12, 40], aguaCicloMm: [400, 600], valorForrajero: "alto",
});
const CATALOGO: Cultivo[] = [trigo, garbanzo, vicia, colza, yuca, frijol, pradera, maizTropical];

function terreno(): IAnalisisTerrenoQuery {
  return {
    analizar: (area: AreaSeleccionada) => Promise.resolve({
      ubicacion: area.resumen(), aptitud: "apto", mensajeAptitud: "Apto", viasCercanas: [], elevacionM: null, pendientePct: null,
      afectacion: { carreteraPct: 0, edificacionPct: 0, aguaPct: 0, excluidoPct: 0, puntosMuestreados: 1 },
      suelo: null, humedadSuelo: null, ndvi: null, cobertura: null, fuentes: [], vaciosInformacion: [], advertencias: ["Aviso del terreno."],
    }),
  };
}
const motor = (p: PerfilClimaticoDto, cs = CATALOGO) =>
  new MotorRotaciones(
    { listar: () => Promise.resolve(cs), buscarPorClave: (k) => Promise.resolve(cs.find((c) => c.clave === k) ?? null) },
    { porUbicacion: () => Promise.resolve(Result.ok(p)) },
    terreno(),
  );
async function comparar(p: PerfilClimaticoDto, cultivoActual: string, extra: { tieneRiego?: boolean; secuenciaActual?: string[]; prioridades?: typeof PRIORIDADES } = {}) {
  const r = await new CompararRotacionesUbicacionUseCase(motor(p)).execute(
    { area: { tipo: "punto", latitud: p.latitud, longitud: 0 }, cultivoActual, tieneRiego: extra.tieneRiego ?? false, secuenciaActual: extra.secuenciaActual, prioridades: extra.prioridades ?? PRIORIDADES },
    contexto,
  );
  if (!r.ok) throw new Error(r.error.code + ": " + r.error.message);
  return r.value;
}
const ctx = (p: PerfilClimaticoDto, riego = false): ContextoMotor => ({
  perfil: p, ventanas: construirVentanas(riego ? p.temporadasCultivo.conRiego : p.temporadasCultivo.secano), tieneRiego: riego,
  suelo: { ph: null, textura: null }, pendientePct: null, mesesBaldios: [], excluidoPct: 0,
});

Deno.test("ventanas: utilidades de meses con vuelta de año", () => {
  assertEquals(mesesDesde(11, 4), [11, 12, 1, 2]);
  assertEquals(mesesEntre(10, 3), 5);
  assertEquals(mesesEntre(3, 3), 12);
});

Deno.test("ventanas: trópico sin estación seca → dos temporadas de 6 meses", () => {
  const v = construirVentanas(TROPICO.temporadasCultivo.secano);
  assertEquals(v.length, 2);
  assertEquals(v.map((x) => x.meses.length), [6, 6]);
});

Deno.test("puntaje total: pondera con los pesos del agricultor y con pesos 0 usa el promedio simple", () => {
  const p = { agua: 100, suelo: 0, plagas: 0, forraje: 0, ingreso: 0 };
  assertEquals(calcularPuntajeTotal(p, { agua: 5, suelo: 0, plagas: 0, forraje: 0, ingreso: 0 }), 100);
  assertEquals(calcularPuntajeTotal(p, { agua: 0, suelo: 0, plagas: 0, forraje: 0, ingreso: 0 }), 20);
});

Deno.test("paso: la pradera continuada en invierno no cuenta como siembra fuera de temperatura", () => {
  const c = ctx(MEDITERRANEO);
  const s = evaluarSecuencia([
    { cultivo: pradera, continua: false },
    { cultivo: pradera, continua: true },
    { cultivo: pradera, continua: true },
    { cultivo: pradera, continua: true },
  ], c, PRIORIDADES);
  assertEquals(s.reglas.find((r) => r.regla === "no_repetir_familia")!.cumple, true);
  assertEquals(s.reglas.find((r) => r.regla === "temperatura_apta")!.cumple, true);
});

Deno.test("paso: la yuca en el trópico ocupa dos temporadas (necesitaSiguiente)", () => {
  const ev = evaluarPaso(yuca, 1, false, ctx(TROPICO));
  assert(ev.necesitaSiguiente);
});

Deno.test("motor: en el trópico la yuca de la estrategia A continúa en la temporada siguiente", async () => {
  const c = await comparar(TROPICO, "yuca");
  const a = c.estrategias[0];
  assertEquals(a.secuencia.map((p) => p.continua), [false, true, false, true]);
});

Deno.test("motor mediterráneo (secano): temporada de otoño–invierno + intervalo seco en barbecho para la actual", async () => {
  const c = await comparar(MEDITERRANEO, "trigo");
  assertEquals(c.ventanas.map((v) => v.tipo), ["temporada", "intervalo"]);
  assertEquals(c.estrategias[0].secuencia.map((p) => p.cultivoClave), ["trigo", "barbecho", "trigo", "barbecho"]);
  assert(c.clima.mesesDeficitHidrico.includes(7));
  assert(c.estrategias.some((e) => e.id === "D"), "con déficit hídrico se propone la estrategia D");
  assert(c.oportunidades.some((o) => o.tipo === "romper_ciclo_plagas"));
});

Deno.test("motor: con riego usa las temporadas con riego (más ventanas de temporada)", async () => {
  const secano = await comparar(MEDITERRANEO, "trigo");
  const riego = await comparar(MEDITERRANEO, "trigo", { tieneRiego: true });
  assert(riego.ventanas.filter((v) => v.tipo === "temporada").length > secano.ventanas.filter((v) => v.tipo === "temporada").length);
  assertEquals(riego.sitio.tieneRiego, true);
});

Deno.test("motor: sin temporada de secano usa la térmica y lo advierte", async () => {
  const seco = perfil(25, Array(12).fill(20), Array(12).fill(35));
  const c = await comparar(seco, "garbanzo");
  assert(c.advertencias.some((a) => a.includes("no tiene temporada de secano")));
  assert(c.advertencias.includes("Aviso del terreno."), "propaga las advertencias del terreno");
});

Deno.test("motor: con secuencia declarada la A la respeta y no dice que se asumió", async () => {
  const c = await comparar(MEDITERRANEO, "trigo", { secuenciaActual: ["trigo", "garbanzo"] });
  const a = c.estrategias[0];
  assertEquals(a.secuencia.filter((p) => p.tipoVentana === "temporada").map((p) => p.cultivoClave), ["trigo", "garbanzo"]);
  assertEquals(a.vaciosInformacion.some((v) => v.includes("ASUMIÓ")), false);
  assert(a.evidencia.some((e) => e.fuente === "Agricultor"));
});

Deno.test("motor: explicaciones con evidencia por fuente y riesgos generales en todas las estrategias", async () => {
  const c = await comparar(MEDITERRANEO, "trigo");
  for (const e of c.estrategias) {
    assert(e.evidencia.some((x) => x.fuente === "NASA POWER"), e.id);
    assert(e.evidencia.some((x) => x.fuente === "ECOCROP"), e.id);
    assert(e.riesgos.some((r) => r.includes("plantas voluntarias")), e.id);
    assert(e.vaciosInformacion.some((v) => v.includes("análisis de suelo")), e.id);
  }
});

Deno.test("motor: el calendario marca temporada y expone los cultivos de la actual a la helada", async () => {
  const c = await comparar(MEDITERRANEO, "garbanzo");
  assertEquals(c.calendario.filter((m) => m.enTemporada).length > 0, true);
  // Enero hiela: el garbanzo (tolerancia media) de la estrategia A queda expuesto si su ciclo pasa por enero.
  const enero = c.calendario[0];
  if (c.estrategias[0].secuencia[0].mesesCiclo.includes(1) && enero.vulnerabilidad.severidadMaxima !== "baja") {
    assert(enero.cultivosExpuestos.includes("Garbanzo"));
  }
});

Deno.test("motor: es determinista (dos corridas iguales dan exactamente lo mismo)", async () => {
  const a = await comparar(MEDITERRANEO, "trigo");
  const b = await comparar(MEDITERRANEO, "trigo");
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});

Deno.test("mejorCoberturaPara: en meses con helada elige una cobertura que la tolere", () => {
  const c = mejorCoberturaPara([12, 1, 2], CATALOGO, ctx(MEDITERRANEO));
  assertEquals(c?.clave, "vicia_villosa");
  assertEquals(mejorCoberturaPara([], CATALOGO, ctx(MEDITERRANEO)), null);
});

Deno.test("área poligonal: el motor analiza el área y no inventa nombre ni altitud", async () => {
  const d = 100 / 111_195;
  const r = await new CompararRotacionesUbicacionUseCase(motor(MEDITERRANEO)).execute(
    {
      area: { tipo: "poligono", geojson: { type: "Polygon", coordinates: [[[-4.85, 37.8], [-4.85 + d, 37.8], [-4.85 + d, 37.8 + d], [-4.85, 37.8 + d], [-4.85, 37.8]]] } },
      cultivoActual: "trigo", tieneRiego: false, prioridades: PRIORIDADES,
    },
    contexto,
  );
  assert(r.ok);
  assertEquals(r.value.sitio.nombre, null);
  assertEquals(r.value.sitio.ubicacion.tipo, "poligono");
  assertEquals(r.value.sitio.fuenteAltitud, "clima");
});

Deno.test("motor: en un desierto sin riego ningún cultivo es viable → ROTACION_SIN_ALTERNATIVAS (no inventa)", async () => {
  const desierto = perfil(25, Array(12).fill(24), Array(12).fill(5));
  const r = await new CompararRotacionesUbicacionUseCase(motor(desierto)).execute(
    { area: { tipo: "punto", latitud: 25, longitud: 0 }, cultivoActual: "trigo", tieneRiego: false, prioridades: PRIORIDADES },
    contexto,
  );
  assertEquals(!r.ok && r.error.code, "ROTACION_SIN_ALTERNATIVAS");
});
