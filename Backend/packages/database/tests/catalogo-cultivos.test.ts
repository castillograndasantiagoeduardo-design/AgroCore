/**
 * Valida el catálogo REAL de cultivos (generado desde FAO ECOCROP + FAOSTAT): si alguien lo regenera mal o edita un
 * rango y lo deja incoherente, este test falla antes de que la API se niegue a arrancar.
 */
import { assert, assertEquals, assertThrows } from "@std/assert";
import { FAMILIAS_BOTANICAS, GRUPOS_CULTIVO } from "@agrocore/contracts";
import { CATALOGO_CULTIVOS, CULTIVOS_SIN_FUENTE } from "../src/catalogos/catalogo-cultivos.datos.ts";
import { CatalogoCultivosEnMemoria } from "../src/catalogos/catalogo-cultivos-en-memoria.ts";

/** Campos que pueden quedar sin fuente: el motor no los usa para decidir. */
const CAMPOS_SIN_FUENTE_VALIDOS = ["toleranciaHelada", "texturas", "valorForrajero", "coberturaSuelo", "valorProduccionHa"];

Deno.test("Catálogo real: los cultivos con fuente pasan las invariantes de Cultivo y la facelia queda fuera", async () => {
  const catalogo = new CatalogoCultivosEnMemoria();
  const cultivos = await catalogo.listar();
  assertEquals(cultivos.length, 50);
  assertEquals((await catalogo.buscarPorClave("avena_vicia"))?.fijaNitrogeno, true);
  assertEquals(await catalogo.buscarPorClave("facelia"), null);
  assert(CULTIVOS_SIN_FUENTE.some((c) => c.clave === "facelia"), "la facelia se declara como cultivo sin fuente");
});

Deno.test("Catálogo real: cubre todos los grupos (cereales, leguminosas, tubérculos, hortalizas, forrajes, coberturas...)", async () => {
  const cultivos = await new CatalogoCultivosEnMemoria().listar();
  for (const grupo of GRUPOS_CULTIVO) assert(cultivos.some((c) => c.grupo === grupo), "falta el grupo " + grupo);
  const familias = new Set(cultivos.flatMap((c) => c.familias));
  assert(familias.size >= 15, "familias distintas: " + familias.size + " de " + FAMILIAS_BOTANICAS.length);
  assert(cultivos.filter((c) => c.esCobertura).length >= 6, "coberturas y abonos verdes (vicia, mucuna, crotalaria, canavalia, mostaza, rábano)");
});

Deno.test("Catálogo real: sirve en climas fríos, templados, tropicales y áridos", async () => {
  const cultivos = await new CatalogoCultivosEnMemoria().listar();
  const optimos = (t: number) => cultivos.filter((c) => c.aptitudPorTemperatura(t) === "optima").length;
  // Con los rangos TOPMN–TOPMX de ECOCROP (más anchos que los del catálogo anterior) a 12 °C hay 7 óptimos y 47 posibles.
  assert(optimos(12) >= 5, "clima frío / de altura");
  assert(cultivos.filter((c) => c.aptitudPorTemperatura(12) !== "no_apta").length >= 40, "clima frío: aptos (óptimos o posibles)");
  assert(optimos(18) >= 15, "templado");
  assert(optimos(27) >= 10, "tropical");
  assert(cultivos.filter((c) => c.toleranciaSequia === "alta").length >= 10, "árido");
  // Papa óptima con la temperatura media de Duitama (~15 °C).
  assertEquals((await new CatalogoCultivosEnMemoria().buscarPorClave("papa"))?.aptitudPorTemperatura(15), "optima");
});

Deno.test("Catálogo real: cada ficha cita su registro de FAO ECOCROP y la fuente de cada valor que usa el motor", async () => {
  const cultivos = await new CatalogoCultivosEnMemoria().listar();
  for (const c of cultivos) {
    assert(c.fuentes.length >= 1, c.clave);
    assert(c.ecocrop.codigos.length >= 1 && c.ecocrop.url.startsWith("http"), c.clave + ": sin EcoPortCode");
    for (const campo of c.camposSinFuente) assert(CAMPOS_SIN_FUENTE_VALIDOS.includes(campo), c.clave + ": campo sin fuente inesperado " + campo);
    // Todo campo que decide viabilidad (temperatura, ciclo, agua) tiene fuente.
    assertEquals(c.sinDatosDeViabilidad, false, c.clave);
    for (const campo of ["temperaturaOptimaC", "temperaturaAbsolutaC", "cicloDias", "aguaCicloMm", "lluviaAnualOptimaMm", "phOptimo"] as const) {
      assertEquals(c.fuenteDe(campo)?.fuente, "FAO_ECOCROP", c.clave + "." + campo);
    }
    // El valor de producción solo existe con fuente (FAOSTAT); si falta, el campo se declara sin fuente.
    if (c.valorProduccionHa.valor === null) assert(c.sinFuente("valorProduccionHa"), c.clave);
    else assertEquals(c.valorProduccionHa.fuente, "FAOSTAT", c.clave);
  }
});

Deno.test("Catálogo: un dato incoherente impide construirlo (Fail-Fast)", () => {
  const malo = { ...CATALOGO_CULTIVOS[0], temperaturaOptimaC: [1, 60] as [number, number] };
  assertThrows(() => new CatalogoCultivosEnMemoria([malo]), Error, "temperatura óptima");
});

Deno.test("Catálogo: claves repetidas impiden construirlo", () => {
  assertThrows(() => new CatalogoCultivosEnMemoria([CATALOGO_CULTIVOS[0], CATALOGO_CULTIVOS[0]]), Error, "Clave repetida");
});
