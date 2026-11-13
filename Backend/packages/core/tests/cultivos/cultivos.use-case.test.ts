/**
 * Tests del módulo cultivos con un catálogo sintético en memoria (sin MySQL).
 * Catálogo global: la aptitud se evalúa por la temperatura media (estilo FAO ECOCROP), no por altitud.
 */
import { assertEquals } from "@std/assert";
import { type ContextoSolicitud, Cultivo, type ICultivoRepository, ListarCultivosUseCase, ObtenerCultivoUseCase } from "../../src/index.ts";
import { cultivoDePrueba as cultivo, datosCultivo as datos } from "../_fixtures/cultivos.ts";

const papa = cultivo();
const haba = cultivo({
  clave: "haba", nombre: "Haba", familias: ["fabaceas"], grupo: "leguminosa", fijaNitrogeno: true,
  temperaturaOptimaC: [10, 16], temperaturaAbsolutaC: [3, 24], toleranciaHelada: "alta", texturas: ["franca", "arcillosa"],
  phOptimo: [6.5, 8],
});
const maiz = cultivo({
  clave: "maiz", nombre: "Maíz", familias: ["poaceas"], uso: "doble_proposito", grupo: "cereal",
  temperaturaOptimaC: [18, 33], temperaturaAbsolutaC: [10, 40], lluviaAnualOptimaMm: [600, 1200], toleranciaSequia: "media",
});
const mijo = cultivo({
  clave: "mijo_perla", nombre: "Mijo perla", familias: ["poaceas"], grupo: "cereal",
  temperaturaOptimaC: [25, 35], temperaturaAbsolutaC: [12, 42], lluviaAnualOptimaMm: [300, 750], toleranciaSequia: "alta",
});

function repo(cultivos: Cultivo[]): ICultivoRepository {
  return {
    listar: () => Promise.resolve(cultivos),
    buscarPorClave: (clave) => Promise.resolve(cultivos.find((c) => c.clave === clave) ?? null),
  };
}

const actor: ContextoSolicitud = { origen: "script", ip: null };
const listar = new ListarCultivosUseCase(repo([haba, maiz, mijo, papa]));

// ---------------------------------------------------------------------------
// Entidad: invariantes
// ---------------------------------------------------------------------------
Deno.test("Cultivo: temperatura óptima fuera del rango absoluto → CULTIVO_DATOS_INVALIDOS", () => {
  const r = Cultivo.crear(datos({ temperaturaOptimaC: [4, 18] }));
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "CULTIVO_DATOS_INVALIDOS");
});

Deno.test("Cultivo: rango con mínimo mayor que máximo → CULTIVO_DATOS_INVALIDOS", () => {
  const r = Cultivo.crear(datos({ cicloDias: [180, 120] }));
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.message.includes("cicloDias"), true);
});

Deno.test("Cultivo: acepta temperaturas negativas en el rango absoluto (centeno de invierno)", () => {
  assertEquals(Cultivo.crear(datos({ temperaturaAbsolutaC: [-2, 26] })).ok, true);
});

Deno.test("Cultivo: pH fuera de 3–10, sin texturas o sin fuentes no se acepta", () => {
  assertEquals(Cultivo.crear(datos({ phOptimo: [2, 6] })).ok, false);
  assertEquals(Cultivo.crear(datos({ texturas: [] })).ok, false);
  assertEquals(Cultivo.crear(datos({ fuentes: [] })).ok, false);
});

Deno.test("Cultivo: una solanácea no puede fijar nitrógeno", () => {
  assertEquals(Cultivo.crear(datos({ fijaNitrogeno: true })).ok, false);
});

Deno.test("Cultivo: aptitud por temperatura media (óptima / posible / no apta)", () => {
  assertEquals(papa.aptitudPorTemperatura(15), "optima");
  assertEquals(papa.aptitudPorTemperatura(22), "posible");
  assertEquals(papa.aptitudPorTemperatura(28), "no_apta");
});

Deno.test("Cultivo: compatibilidad de suelo (pH y textura; null si no se conoce)", () => {
  assertEquals(papa.phCompatible(5.5), true);
  assertEquals(papa.phCompatible(8.2), false);
  assertEquals(papa.phCompatible(null), null);
  assertEquals(papa.texturaCompatible("arcillosa"), false);
  assertEquals(papa.texturaCompatible(null), null);
});

Deno.test("Cultivo: comparten familia (papa tras papa sí, haba tras papa no)", () => {
  assertEquals(papa.compartenFamilia(cultivo()), true);
  assertEquals(papa.compartenFamilia(haba), false);
});

// ---------------------------------------------------------------------------
// ListarCultivosUseCase
// ---------------------------------------------------------------------------
Deno.test("Listar: sin filtros devuelve todo y sin aptitudClima", async () => {
  const r = await listar.execute({}, actor);
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.length, 4);
    assertEquals(r.value[0].aptitudClima, undefined);
  }
});

Deno.test("Listar: a 14 °C de media (altiplano) quita el mijo y pone primero los óptimos", async () => {
  const r = await listar.execute({ tempMediaC: 14 }, actor);
  if (r.ok) {
    // haba: óptima (10–16) · papa: óptima (12–18) · maíz: posible (abs. 10–40) · mijo: posible (abs. 12–42)
    const aptitudes = Object.fromEntries(r.value.map((c) => [c.clave, c.aptitudClima]));
    assertEquals(aptitudes, { haba: "optima", papa: "optima", maiz: "posible", mijo_perla: "posible" });
    assertEquals(r.value.slice(0, 2).every((c) => c.aptitudClima === "optima"), true);
  }
});

Deno.test("Listar: a 30 °C (Sahel) solo quedan los de clima cálido", async () => {
  const r = await listar.execute({ tempMediaC: 30 }, actor);
  if (r.ok) assertEquals(r.value.map((c) => [c.clave, c.aptitudClima]), [["maiz", "optima"], ["mijo_perla", "optima"]]);
});

Deno.test("Listar: con 250 mm de lluvia anual solo queda lo tolerante a la sequía o de poca lluvia", async () => {
  const r = await listar.execute({ lluviaAnualMm: 250 }, actor);
  if (r.ok) assertEquals(r.value.map((c) => c.clave).sort(), ["mijo_perla"]);
});

Deno.test("Listar: suelo alcalino (pH 8) y arcilloso deja solo la haba", async () => {
  const r = await listar.execute({ ph: 8, textura: "arcillosa" }, actor);
  if (r.ok) assertEquals(r.value.map((c) => c.clave), ["haba"]);
});

Deno.test("Listar: filtros combinados (leguminosas que fijan N, tolerancia a helada, uso, grupo)", async () => {
  const leg = await listar.execute({ familia: "fabaceas", fijaNitrogeno: true }, actor);
  if (leg.ok) assertEquals(leg.value.map((c) => c.clave), ["haba"]);
  const frio = await listar.execute({ toleranciaHeladaMin: "media" }, actor);
  if (frio.ok) assertEquals(frio.value.map((c) => c.clave), ["haba"]);
  const uso = await listar.execute({ uso: "doble_proposito" }, actor);
  if (uso.ok) assertEquals(uso.value.map((c) => c.clave), ["maiz"]);
  const cereales = await listar.execute({ grupo: "cereal" }, actor);
  if (cereales.ok) assertEquals(cereales.value.map((c) => c.clave), ["maiz", "mijo_perla"]);
});

// ---------------------------------------------------------------------------
// ObtenerCultivoUseCase
// ---------------------------------------------------------------------------
Deno.test("Obtener: devuelve la ficha completa", async () => {
  const r = await new ObtenerCultivoUseCase(repo([papa])).execute({ clave: "papa" }, actor);
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.nombreCientifico, "Solanum tuberosum");
    assertEquals(r.value.temperaturaOptimaC, { min: 12, max: 18 });
    // Cada ficha declara de dónde sale: registros de FAO ECOCROP, campos sin fuente y valor de producción (FAOSTAT).
    assertEquals(r.value.ecocrop.codigos, [1]);
    assertEquals(r.value.camposSinFuente, []);
    assertEquals(r.value.valorProduccionHa.fuente, "FAOSTAT");
  }
});

Deno.test("Obtener: clave inexistente → CULTIVO_NO_ENCONTRADO", async () => {
  const r = await new ObtenerCultivoUseCase(repo([papa])).execute({ clave: "unobtanio" }, actor);
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error.code, "CULTIVO_NO_ENCONTRADO");
});

// ---------------------------------------------------------------------------
// Campos sin fuente (FAO ECOCROP no los trae): no se usan para decidir
// ---------------------------------------------------------------------------
Deno.test("Cultivo: texturas sin fuente → texturaCompatible devuelve null y el filtro por textura no lo descarta", async () => {
  const sin = cultivo({ clave: "sin_textura", nombre: "Sin textura", texturas: ["arenosa"], camposSinFuente: ["texturas"] });
  assertEquals(sin.sinFuente("texturas"), true);
  assertEquals(sin.texturaCompatible("arcillosa"), null);
  const r = await new ListarCultivosUseCase(repo([sin, papa])).execute({ textura: "arcillosa" }, actor);
  if (r.ok) assertEquals(r.value.map((c) => c.clave), ["sin_textura"]);
});

Deno.test("Cultivo: toleranciaHelada sin fuente no cumple toleranciaHeladaMin; forraje y cobertura sin fuente salen como null", async () => {
  const sin = cultivo({ clave: "sin_helada", nombre: "Sin helada", toleranciaHelada: "alta", camposSinFuente: ["toleranciaHelada", "valorForrajero", "coberturaSuelo"] });
  assertEquals(sin.toleranciaHeladaConocida(), null);
  assertEquals(sin.valorForrajeroConocido(), null);
  assertEquals(sin.coberturaConocida(), null);
  assertEquals(papa.toleranciaHeladaConocida(), "baja");
  const r = await new ListarCultivosUseCase(repo([sin, haba])).execute({ toleranciaHeladaMin: "media" }, actor);
  if (r.ok) assertEquals(r.value.map((c) => c.clave), ["haba"]);
});

Deno.test("Cultivo: sin fuente en temperatura o ciclo → no es apto por temperatura en el filtro", async () => {
  const sin = cultivo({ clave: "sin_temp", nombre: "Sin temperatura", camposSinFuente: ["temperaturaOptimaC"] });
  assertEquals(sin.sinDatosDeViabilidad, true);
  const r = await new ListarCultivosUseCase(repo([sin, papa])).execute({ tempMediaC: 15 }, actor);
  if (r.ok) assertEquals(r.value.map((c) => c.clave), ["papa"]);
});
