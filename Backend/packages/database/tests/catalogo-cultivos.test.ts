/**
 * Valida el catálogo REAL de cultivos: si alguien edita un rango y lo deja incoherente,
 * este test falla antes de que la API se niegue a arrancar.
 */
import { assertEquals, assertThrows } from "@std/assert";
import { CATALOGO_CULTIVOS, CatalogoCultivosEnMemoria } from "../src/index.ts";

Deno.test("Catálogo real: los 11 cultivos pasan las invariantes de Cultivo", async () => {
  const catalogo = new CatalogoCultivosEnMemoria();
  const cultivos = await catalogo.listar();
  assertEquals(cultivos.length, 11);
  assertEquals((await catalogo.buscarPorClave("avena_vicia"))?.fijaNitrogeno, true);
});

Deno.test("Catálogo real: a 2.530 m (centro de Duitama) papa es óptima", async () => {
  const papa = await new CatalogoCultivosEnMemoria().buscarPorClave("papa");
  assertEquals(papa?.aptitudPorAltitud(2530), "optima");
});

Deno.test("Catálogo: un dato incoherente impide construirlo (Fail-Fast)", () => {
  const malo = { ...CATALOGO_CULTIVOS[0], altitudOptimaM: [1000, 3000] as [number, number] };
  assertThrows(() => new CatalogoCultivosEnMemoria([malo]), Error, "altitud óptima");
});

Deno.test("Catálogo: claves repetidas impiden construirlo", () => {
  assertThrows(() => new CatalogoCultivosEnMemoria([CATALOGO_CULTIVOS[0], CATALOGO_CULTIVOS[0]]), Error, "Clave repetida");
});
