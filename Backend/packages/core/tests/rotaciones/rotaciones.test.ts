/**
 * Tests del motor de rotaciones generalizado (temporadas reales, 12 reglas, estrategias A–D, calendario y
 * oportunidades) con perfiles climáticos sintéticos, terreno falso y un catálogo pequeño (sin red ni MySQL).
 */
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { ComparacionRotacionesSchema, type PerfilClimaticoDto, type PerfilTerrenoDto } from "@agrocore/contracts";
import { DomainError, Result } from "@agrocore/shared-kernel";
import {
  AreaSeleccionada,
  calcularCalendarioVulnerabilidad,
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
  type ICultivoRepository,
  type IPerfilClimaticoQuery,
  MotorRotaciones,
} from "../../src/index.ts";
import { cultivoDePrueba } from "../_fixtures/cultivos.ts";

// ---------------------------------------------------------------------------
// Perfiles climáticos sintéticos
// ---------------------------------------------------------------------------
const NOMBRES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

interface OpcionesPerfil {
  latitud: number;
  temp: number[];
  lluvia: number[];
  heladas?: number[];
  calor?: number[];
}

function perfil(o: OpcionesPerfil): PerfilClimaticoDto {
  const promedio = o.lluvia.reduce((a, b) => a + b, 0) / 12;
  const meses = o.temp.map((t, i) => {
    const etoMm = Math.round(et0MensualMm(o.latitud, i + 1, t, t - 5, t + 5));
    const helada = o.heladas?.includes(i + 1) ?? false;
    return {
      mes: i + 1,
      nombreMes: NOMBRES[i],
      lluviaMm: o.lluvia[i],
      tempMediaC: t,
      tempMinC: t - 5,
      tempMaxC: t + 5,
      diasHeladaPromedio: helada ? 6 : 0,
      probabilidadHelada: helada ? 0.6 : 0,
      diasLluviaFuertePromedio: o.lluvia[i] > 150 ? 2 : 0,
      diasCalorPromedio: o.calor?.includes(i + 1) ? 8 : 0,
      etoMm,
      balanceHidricoMm: o.lluvia[i] - etoMm,
      temporada: (o.lluvia[i] >= promedio ? "lluviosa" : "seca") as "lluviosa" | "seca",
    };
  });
  const lluviaAnual = o.lluvia.reduce((a, b) => a + b, 0);
  return {
    latitud: o.latitud,
    longitud: 0,
    altitudReferenciaM: 2500,
    altitudCeldaM: 2500,
    ajusteTemperaturaC: 0,
    periodo: { desde: "1996-01-01", hasta: "2025-12-31", anios: 30 },
    fuente: "NASA POWER (sintético)",
    calibracion: null,
    umbrales: { heladaC: 2, lluviaFuerteMm: 20, calorC: 32 },
    meses,
    resumen: {
      lluviaAnualMm: lluviaAnual,
      tempMediaAnualC: o.temp.reduce((a, b) => a + b, 0) / 12,
      etoAnualMm: meses.reduce((s, m) => s + m.etoMm, 0),
      indiceAridez: 0.8,
      regimenLluvias: "bimodal",
      mesesLluviosos: meses.filter((m) => m.temporada === "lluviosa").map((m) => m.mes),
      mesesSecos: meses.filter((m) => m.temporada === "seca").map((m) => m.mes),
      mesesRiesgoHelada: o.heladas ?? [],
      mesesCalor: o.calor ?? [],
      mesesDeficitHidrico: meses.filter((m) => m.lluviaMm < 0.5 * m.etoMm).map((m) => m.mes),
      mesesLluviaExtrema: [],
      clasificacionClimatica: "de_altura",
    },
    temporadasCultivo: calcularTemporadasCultivo(meses),
    calendarioVulnerabilidad: calcularCalendarioVulnerabilidad(meses),
    advertencias: ["Advertencia del clima de prueba."],
  };
}

/** Trópico de altura bimodal (tipo Duitama): 14 °C todo el año, lluvias mar–jun y sep–nov, helada en enero. */
const ALTIPLANO = perfil({
  latitud: 5.8,
  temp: Array(12).fill(14),
  lluvia: [30, 40, 110, 130, 120, 80, 40, 40, 90, 130, 120, 50],
  heladas: [1],
});
/** Clima con invierno (tipo Iowa): temporada abr–oct, invierno muy frío. */
const CON_INVIERNO = perfil({
  latitud: 42,
  temp: [-7, -4, 3, 10, 16, 21, 24, 23, 18, 11, 3, -4],
  lluvia: [25, 25, 55, 90, 120, 120, 100, 100, 85, 65, 45, 30],
  heladas: [1, 2, 3, 11, 12],
});

// ---------------------------------------------------------------------------
// Catálogo pequeño
// ---------------------------------------------------------------------------
const papa = cultivoDePrueba({ cicloDias: [100, 120] });
const haba = cultivoDePrueba({
  clave: "haba", nombre: "Haba", familias: ["fabaceas"], grupo: "leguminosa", fijaNitrogeno: true, cicloDias: [100, 120],
  temperaturaOptimaC: [10, 18], temperaturaAbsolutaC: [4, 26], toleranciaHelada: "media", necesidadAgua: "media",
  aguaCicloMm: [300, 450], coberturaSuelo: "alta", profundidadRaiz: "profunda", texturas: ["franca", "arcillosa"],
});
const cebada = cultivoDePrueba({
  clave: "cebada", nombre: "Cebada", familias: ["poaceas"], grupo: "cereal", uso: "doble_proposito", cicloDias: [100, 120],
  temperaturaOptimaC: [10, 20], temperaturaAbsolutaC: [4, 28], toleranciaHelada: "alta", necesidadAgua: "baja",
  toleranciaSequia: "alta", aguaCicloMm: [250, 400], valorForrajero: "medio", texturas: ["franca", "arcillosa"],
});
const avenaVicia = cultivoDePrueba({
  clave: "avena_vicia", nombre: "Avena + vicia", familias: ["poaceas", "fabaceas"], grupo: "forraje", uso: "forraje",
  fijaNitrogeno: true, cicloDias: [90, 110], temperaturaOptimaC: [10, 20], temperaturaAbsolutaC: [4, 28],
  toleranciaHelada: "alta", necesidadAgua: "media", aguaCicloMm: [250, 350], coberturaSuelo: "alta", valorForrajero: "alto",
});
const maiz = cultivoDePrueba({
  clave: "maiz", nombre: "Maíz", familias: ["poaceas"], grupo: "cereal", uso: "doble_proposito", cicloDias: [120, 150],
  temperaturaOptimaC: [18, 30], temperaturaAbsolutaC: [10, 40], toleranciaHelada: "baja", necesidadAgua: "media",
  aguaCicloMm: [400, 600], valorForrajero: "alto", profundidadRaiz: "profunda",
});
const soya = cultivoDePrueba({
  clave: "soya", nombre: "Soya", familias: ["fabaceas"], grupo: "oleaginosa", fijaNitrogeno: true, cicloDias: [100, 130],
  temperaturaOptimaC: [18, 28], temperaturaAbsolutaC: [10, 36], toleranciaHelada: "baja", necesidadAgua: "media",
  aguaCicloMm: [350, 500],
});
const centeno = cultivoDePrueba({
  clave: "centeno", nombre: "Centeno", familias: ["poaceas"], grupo: "cereal", uso: "cobertura", cicloDias: [60, 90],
  temperaturaOptimaC: [8, 18], temperaturaAbsolutaC: [-6, 26], toleranciaHelada: "alta", necesidadAgua: "baja",
  aguaCicloMm: [80, 200], coberturaSuelo: "alta",
});
const CATALOGO: Cultivo[] = [papa, haba, cebada, avenaVicia, maiz, soya, centeno];

// ---------------------------------------------------------------------------
// Puertos falsos
// ---------------------------------------------------------------------------
const contexto: ContextoSolicitud = { origen: "script", ip: null };
const PRIORIDADES = { agua: 3, suelo: 3, plagas: 3, forraje: 3, ingreso: 3 };

function terrenoFalso(cambios: Partial<PerfilTerrenoDto> = {}): IAnalisisTerrenoQuery {
  return {
    analizar: (area: AreaSeleccionada) =>
      Promise.resolve({
        ubicacion: area.resumen(),
        aptitud: "apto",
        mensajeAptitud: "Apto para sembrar",
        afectacion: { carreteraPct: 0, edificacionPct: 0, aguaPct: 0, excluidoPct: 0, puntosMuestreados: 1 },
        viasCercanas: [],
        elevacionM: 2500,
        pendientePct: 5,
        suelo: null,
        humedadSuelo: null,
        ndvi: null,
        cobertura: null,
        fuentes: ["Terreno falso"],
        vaciosInformacion: [],
        advertencias: [],
        ...cambios,
      }),
  };
}

const clima = (p: PerfilClimaticoDto): IPerfilClimaticoQuery => ({ porUbicacion: () => Promise.resolve(Result.ok(p)) });
const repoCultivos = (cs: Cultivo[] = CATALOGO): ICultivoRepository => ({
  listar: () => Promise.resolve(cs),
  buscarPorClave: (k) => Promise.resolve(cs.find((c) => c.clave === k) ?? null),
});

function motor(p = ALTIPLANO, t = terrenoFalso(), cs = CATALOGO) {
  return new MotorRotaciones(repoCultivos(cs), clima(p), t);
}

async function comparar(entrada: { cultivoActual?: string; secuenciaActual?: string[]; tieneRiego?: boolean; prioridades?: typeof PRIORIDADES } = {}, m = motor()) {
  const r = await new CompararRotacionesUbicacionUseCase(m).execute(
    {
      area: { tipo: "punto", latitud: 5.8, longitud: -73 },
      cultivoActual: entrada.cultivoActual ?? "papa",
      secuenciaActual: entrada.secuenciaActual,
      tieneRiego: entrada.tieneRiego ?? false,
      prioridades: entrada.prioridades ?? PRIORIDADES,
    },
    contexto,
  );
  if (!r.ok) throw new Error("Se esperaba éxito: " + r.error.code + " " + r.error.message);
  return r.value;
}

function ctxMotor(p = ALTIPLANO, cambios: Partial<ContextoMotor> = {}): ContextoMotor {
  return {
    perfil: p,
    ventanas: construirVentanas(p.temporadasCultivo.secano),
    tieneRiego: false,
    suelo: { ph: null, textura: null },
    pendientePct: null,
    mesesBaldios: [],
    excluidoPct: 0,
    ...cambios,
  };
}

// ---------------------------------------------------------------------------
// Ventanas en temporadas reales
// ---------------------------------------------------------------------------
Deno.test("ventanas: el altiplano bimodal tiene 2 temporadas; el clima con invierno, temporada + intervalo", () => {
  const altiplano = construirVentanas(ALTIPLANO.temporadasCultivo.secano);
  assertEquals(altiplano.map((v) => v.tipo), ["temporada", "temporada"]);
  // Cada ventana dura hasta la siguiente siembra: entre las dos suman 12 meses.
  assertEquals(altiplano[0].meses.length + altiplano[1].meses.length, 12);

  const invierno = construirVentanas(CON_INVIERNO.temporadasCultivo.secano);
  assertEquals(invierno.map((v) => v.tipo), ["temporada", "intervalo"]);
  assert(invierno[1].meses.includes(1) && invierno[1].meses.includes(12), "el intervalo es el invierno");
});

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------
Deno.test("paso: en el intervalo de invierno solo es viable lo que tolera el frío; el barbecho siempre", () => {
  const ctx = ctxMotor(CON_INVIERNO);
  const barbecho = evaluarPaso(null, 2, false, ctx);
  assertEquals(barbecho.paso.cultivoClave, "barbecho");
  assertEquals(barbecho.paso.tipoVentana, "intervalo");
  const maizInvierno = evaluarPaso(maiz, 2, false, ctx);
  assertEquals(maizInvierno.paso.aptitudClima, "no_apta");
});

Deno.test("paso: el mes de siembra se elige dentro de la ventana para esquivar la helada", () => {
  // Temporada abr–oct; el maíz (5 meses, sensible a helada) no debería sembrarse en abril si abril hiela.
  const p = perfil({
    latitud: 42,
    temp: [-7, -4, 3, 10, 16, 21, 24, 23, 18, 11, 3, -4],
    lluvia: [25, 25, 55, 90, 120, 120, 100, 100, 85, 65, 45, 30],
    heladas: [1, 2, 3, 4, 11, 12],
  });
  const ctx = ctxMotor(p, { ventanas: construirVentanas([{ inicioMes: 4, meses: [4, 5, 6, 7, 8, 9, 10] }]) });
  const ev = evaluarPaso(maiz, 1, false, ctx);
  assert(ev.paso.mesSiembra >= 5, "siembra en " + ev.paso.mesSiembra);
  assertEquals(ev.paso.riesgoHelada, "ninguno");
});

Deno.test("paso: un cultivo largo que no cabe solo ocupa también la ventana siguiente", () => {
  const largo = cultivoDePrueba({ clave: "tarwi", nombre: "Tarwi", familias: ["fabaceas"], fijaNitrogeno: true, cicloDias: [240, 270], temperaturaOptimaC: [10, 18], temperaturaAbsolutaC: [4, 26] });
  const ev = evaluarPaso(largo, 1, false, ctxMotor());
  assert(ev.necesitaSiguiente);
  assert(ev.cabe);
});

// ---------------------------------------------------------------------------
// Reglas
// ---------------------------------------------------------------------------
const regla = (s: ReturnType<typeof evaluarSecuencia>, nombre: string) => s.reglas.find((r) => r.regla === nombre)!;
const sec = (...cs: (Cultivo | null)[]) => cs.map((c) => ({ cultivo: c, continua: false }));

Deno.test("reglas: devuelve siempre las 12 y detecta repetición de familia y falta de leguminosa", () => {
  const s = evaluarSecuencia(sec(papa, papa, papa, papa), ctxMotor(), PRIORIDADES);
  assertEquals(s.reglas.length, 12);
  assertEquals(regla(s, "no_repetir_familia").cumple, false);
  assertEquals(regla(s, "leguminosa_cada_dos_anios").cumple, false);
  assertEquals(regla(s, "no_sembrar_en_carretera").cumple, true);
  assertEquals(regla(s, "suelo_compatible").cumple, true); // sin datos de suelo no se penaliza
});

Deno.test("reglas: el barbecho no rompe la cadena de familias (maíz → barbecho → maíz repite)", () => {
  const s = evaluarSecuencia(sec(maiz, null, maiz, null), ctxMotor(CON_INVIERNO), PRIORIDADES);
  assertEquals(regla(s, "no_repetir_familia").cumple, false);
});

Deno.test("reglas: pendiente > 25 % con poca cobertura, suelo incompatible, baldío y área excluida", () => {
  const ctx = ctxMotor(ALTIPLANO, { pendientePct: 32, suelo: { ph: 8.5, textura: "arcillosa" }, mesesBaldios: [1, 2, 3], excluidoPct: 12 });
  const s = evaluarSecuencia(sec(papa, cebada, papa, cebada), ctx, PRIORIDADES);
  assertEquals(regla(s, "cobertura_en_pendiente").cumple, false);
  assertEquals(regla(s, "suelo_compatible").cumple, false);
  assert(regla(s, "no_sembrar_en_carretera").detalle.includes("12 %"));
  assertEquals(regla(s, "aprovechar_baldio").regla, "aprovechar_baldio");
});

Deno.test("puntajes: el monocultivo de papa puntúa 0 en plagas y la rotación con leguminosa más en suelo", () => {
  const mono = evaluarSecuencia(sec(papa, papa, papa, papa), ctxMotor(), PRIORIDADES);
  const rota = evaluarSecuencia(sec(papa, haba, cebada, haba), ctxMotor(), PRIORIDADES);
  assertEquals(mono.puntajes.plagas, 0);
  assert(rota.puntajes.suelo > mono.puntajes.suelo);
  assertEquals(rota.puntajes.plagas, 85); // sin repeticiones seguidas; −15 porque las fabáceas se siembran 2 veces
});

// ---------------------------------------------------------------------------
// Motor completo
// ---------------------------------------------------------------------------
Deno.test("motor: altiplano → ≥ 3 estrategias distintas, A sin corregir, B con la papa, y el contrato se cumple", async () => {
  const c = await comparar();
  ComparacionRotacionesSchema.parse(c);
  assert(c.estrategias.length >= 3);
  const [a, b, cc] = c.estrategias;
  assertEquals(a.secuencia.map((p) => p.cultivoClave), ["papa", "papa", "papa", "papa"]);
  assert(b.secuencia.some((p) => p.cultivoClave === "papa"));
  const claves = c.estrategias.map((e) => e.secuencia.map((p) => p.cultivoClave).join(","));
  assertEquals(new Set(claves).size, claves.length, "todas distintas");
  assertNotEquals(b.secuencia.map((p) => p.cultivoClave).join(), cc.secuencia.map((p) => p.cultivoClave).join());
  for (const e of c.estrategias) {
    assert(e.porQue && e.evidencia.length && e.beneficios.length && e.vaciosInformacion.length && e.riesgos.length, e.id);
    assert(e.evidencia.every((x) => x.fuente), "cada evidencia con su fuente");
  }
  assertEquals(c.calendario.length, 12);
  assert(c.oportunidades.length >= 1);
  assert(c.oportunidades.some((o) => o.tipo === "romper_ciclo_plagas"));
});

Deno.test("motor: clima con invierno → el intervalo queda en barbecho (A) o con cobertura tolerante al frío", async () => {
  const c = await comparar({ cultivoActual: "maiz" }, motor(CON_INVIERNO));
  assertEquals(c.ventanas.map((v) => v.tipo), ["temporada", "intervalo"]);
  const a = c.estrategias[0];
  assertEquals(a.secuencia.map((p) => p.cultivoClave), ["maiz", "barbecho", "maiz", "barbecho"]);
  for (const e of c.estrategias.slice(1)) {
    for (const p of e.secuencia.filter((x) => x.tipoVentana === "intervalo")) {
      assert(p.cultivoClave === "barbecho" || p.cultivoClave === "centeno", e.id + ": " + p.cultivoClave);
    }
  }
});

Deno.test("motor: con prioridad de agua ≥ 4 aparece la estrategia D", async () => {
  const c = await comparar({ prioridades: { ...PRIORIDADES, agua: 5 } });
  assertEquals(c.estrategias.map((e) => e.id).includes("D"), true);
});

Deno.test("motor: sobre una carretera → TERRENO_NO_APTO 'No se puede sembrar: es carretera', sin rotaciones", async () => {
  const t = terrenoFalso({ aptitud: "no_apto_carretera", mensajeAptitud: "No se puede sembrar: es carretera" });
  const r = await new CompararRotacionesUbicacionUseCase(motor(ALTIPLANO, t)).execute(
    { area: { tipo: "punto", latitud: 1, longitud: 1 }, cultivoActual: "papa", tieneRiego: false, prioridades: PRIORIDADES },
    contexto,
  );
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.error.code, "TERRENO_NO_APTO");
    assertEquals(r.error.message, "No se puede sembrar: es carretera");
  }
});

Deno.test("motor: los meses baldíos del NDVI generan la oportunidad de cobertura", async () => {
  const t = terrenoFalso({
    ndvi: {
      fuente: "x", desde: "2021-01-01", hasta: "2025-12-31", serie: [],
      climatologia: Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, ndviMedio: 0.5, muestras: 10 })),
      mesesBaldios: [7, 8], reglaBaldio: "x", estres: { mesesConEstres: [], anomaliaMedia: null, detalle: "x" },
    },
  });
  const c = await comparar({}, motor(ALTIPLANO, t));
  assert(c.oportunidades.some((o) => o.tipo === "baldio_cobertura" && o.meses.includes(7)));
  assert(c.calendario[6].baldio && c.calendario[6].oportunidad);
});

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------
Deno.test("ubicación con altitud del usuario: sitio.tipo ubicacion y fuenteAltitud usuario", async () => {
  const r = await new CompararRotacionesUbicacionUseCase(motor()).execute(
    { area: { tipo: "punto", latitud: 5.8, longitud: -73 }, cultivoActual: "papa", altitudM: 2500, tieneRiego: false, prioridades: PRIORIDADES },
    contexto,
  );
  assert(r.ok);
  assertEquals(r.value.sitio.tipo, "ubicacion");
  assertEquals(r.value.sitio.fuenteAltitud, "usuario");
  assertEquals(r.value.sitio.cultivoActual, "papa");
});

Deno.test("ubicación sin cultivoActual: compara igual, sin estrategia A", async () => {
  const r = await new CompararRotacionesUbicacionUseCase(motor()).execute(
    { area: { tipo: "punto", latitud: 5.8, longitud: -73 }, tieneRiego: false, prioridades: PRIORIDADES },
    contexto,
  );
  assert(r.ok);
  assertEquals(r.value.sitio.cultivoActual, null);
  assertEquals(r.value.estrategias.some((e) => e.id === "A"), false);
});

Deno.test("errores: cultivoActual con clave desconocida → ROTACION_CULTIVO_DESCONOCIDO", async () => {
  const c = await new CompararRotacionesUbicacionUseCase(motor()).execute(
    { area: { tipo: "punto", latitud: 1, longitud: 1 }, cultivoActual: "unobtanio", tieneRiego: false, prioridades: PRIORIDADES },
    contexto,
  );
  assertEquals(!c.ok && c.error.code, "ROTACION_CULTIVO_DESCONOCIDO");
});

Deno.test("errores: el error del clima se propaga y un clima sin temporadas → ROTACION_SIN_TEMPORADAS", async () => {
  const falla: IPerfilClimaticoQuery = { porUbicacion: () => Promise.resolve(Result.err(new DomainError("CLIMA_PROVEEDOR_NO_DISPONIBLE", "caída"))) };
  const a = await new CompararRotacionesUbicacionUseCase(new MotorRotaciones(repoCultivos(), falla, terrenoFalso())).execute(
    { area: { tipo: "punto", latitud: 1, longitud: 1 }, cultivoActual: "papa", tieneRiego: false, prioridades: PRIORIDADES },
    contexto,
  );
  assertEquals(!a.ok && a.error.code, "CLIMA_PROVEEDOR_NO_DISPONIBLE");

  const polar = perfil({ latitud: 80, temp: Array(12).fill(-15), lluvia: Array(12).fill(10), heladas: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] });
  const b = await new CompararRotacionesUbicacionUseCase(motor(polar)).execute(
    { area: { tipo: "punto", latitud: 80, longitud: 1 }, cultivoActual: "papa", tieneRiego: true, prioridades: PRIORIDADES },
    contexto,
  );
  assertEquals(!b.ok && b.error.code, "ROTACION_SIN_TEMPORADAS");
});
