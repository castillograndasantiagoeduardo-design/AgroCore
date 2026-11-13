/**
 * Valida el catálogo REAL de cultivos: si alguien edita un rango y lo deja incoherente,
 * este test falla antes de que la API se niegue a arrancar.
 */
import { assert, assertEquals, assertThrows } from "@std/assert";
import { FAMILIAS_BOTANICAS, GRUPOS_CULTIVO } from "@agrocore/contracts";
import { AVISO_VERIFICACION, CATALOGO_CULTIVOS, CatalogoCultivosEnMemoria } from "../src/index.ts";

Deno.test("Catálogo real: los 51 cultivos pasan las invariantes de Cultivo", async () => {
  const catalogo = new CatalogoCultivosEnMemoria();
  const cultivos = await catalogo.listar();
  assertEquals(cultivos.length, 51);
  assertEquals((await catalogo.buscarPorClave("avena_vicia"))?.fijaNitrogeno, true);
});

Deno.test("Catálogo real: cubre todos los grupos (cereales, leguminosas, tubérculos, hortalizas, forrajes, coberturas...)", async () => {
  const cultivos = await new CatalogoCultivosEnMemoria().listar();
  for (const grupo of GRUPOS_CULTIVO) assert(cultivos.some((c) => c.grupo === grupo), "falta el grupo " + grupo);
  const familias = new Set(cultivos.flatMap((c) => c.familias));
  assert(familias.size >= 15, "familias distintas: " + familias.size + " de " + FAMILIAS_BOTANICAS.length);
  assert(cultivos.filter((c) => c.esCobertura).length >= 7, "coberturas y abonos verdes (vicia, mucuna, crotalaria, canavalia, mostaza, rábano, facelia)");
});

Deno.test("Catálogo real: sirve en climas fríos, templados, tropicales y áridos", async () => {
  const cultivos = await new CatalogoCultivosEnMemoria().listar();
  const optimos = (t: number) => cultivos.filter((c) => c.aptitudPorTemperatura(t) === "optima").length;
  assert(optimos(12) >= 10, "clima frío / de altura");
  assert(optimos(18) >= 15, "templado");
  assert(optimos(27) >= 10, "tropical");
  assert(cultivos.filter((c) => c.toleranciaSequia === "alta").length >= 10, "árido");
  // Papa óptima con la temperatura media de Duitama (~15 °C).
  assertEquals((await new CatalogoCultivosEnMemoria().buscarPorClave("papa"))?.aptitudPorTemperatura(15), "optima");
});

Deno.test("Catálogo real: cada ficha trae fuentes, plagas clave y el aviso de verificación", async () => {
  const cultivos = await new CatalogoCultivosEnMemoria().listar();
  for (const c of cultivos) {
    assert(c.fuentes.length >= 2, c.clave);
    assert(c.fuentes.includes(AVISO_VERIFICACION), c.clave);
    assert(c.plagasClave.length >= 1, c.clave);
    assert(c.confianza !== "alta", c.clave + ": sin verificación en línea no puede tener confianza alta");
  }
});

Deno.test("Catálogo: un dato incoherente impide construirlo (Fail-Fast)", () => {
  const malo = { ...CATALOGO_CULTIVOS[0], temperaturaOptimaC: [1, 30] as [number, number] };
  assertThrows(() => new CatalogoCultivosEnMemoria([malo]), Error, "temperatura óptima");
});

Deno.test("Catálogo: claves repetidas impiden construirlo", () => {
  assertThrows(() => new CatalogoCultivosEnMemoria([CATALOGO_CULTIVOS[0], CATALOGO_CULTIVOS[0]]), Error, "Clave repetida");
});
