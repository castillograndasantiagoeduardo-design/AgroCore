/**
 * Pruebas SIN red de las piezas de rendimiento (celdas, caché negativa, limitador),
 * de la climatología de NASA POWER y de la presencia local (país, alias EVA, FAOSTAT).
 */
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { ClimaProveedorNoDisponibleError } from "@agrocore/core";
import { Result } from "@agrocore/shared-kernel";
import { ajustarAMetros, cajaAjustada, celdaPower } from "../src/cache/celdas.ts";
import { CacheEnMemoria, obtenerConCache } from "../src/cache/cache-en-memoria.ts";
import { LimitadorConcurrencia } from "../src/http/limitador-concurrencia.ts";
import { parsearClimatologiaPower } from "../src/nasa-power-climatologia-client.ts";
import { ALIAS_EVA, claveDesdeNombreEva, PresenciaLocalClient } from "../src/presencia/presencia-local-client.ts";
import { TemporizadorSistema } from "../src/temporizador-sistema.ts";

Deno.test("celdaPower: Duitama y un punto a 1 km caen en la misma celda con clave estable", () => {
  const a = celdaPower(5.785, -73.03);
  const b = celdaPower(5.794, -73.03); // ~1 km al norte
  assertEquals(a.clave, b.clave);
  assertEquals(a.clave, "191:171");
  assertEquals(a.latitud, 5.75);
  assertEquals(a.longitud, -72.8125);
  assertEquals(celdaPower(5.785, -73.03).clave, a.clave);
  assertNotEquals(celdaPower(6.4, -73.03).clave, a.clave);
});

Deno.test("ajustarAMetros: puntos cercanos comparten celda y el centro queda dentro de ella", () => {
  const a = ajustarAMetros(5.7851, -73.0301, 250);
  // Puntos a pocos metros del centro de la celda de `a`: caen en la misma celda.
  const b = ajustarAMetros(a.latitud + 0.0003, a.longitud - 0.0003, 250);
  assertEquals(a, b);
  assertEquals(ajustarAMetros(b.latitud, b.longitud, 250), a); // idempotente
  assert(Math.abs(a.latitud - 5.7851) < 250 / 111320);
  assert(Math.abs(a.longitud + 73.0301) < 250 / 111320 * 1.01);
  const lejos = ajustarAMetros(5.80, -73.03, 250);
  assertNotEquals(lejos.latitud, a.latitud);
});

Deno.test("cajaAjustada: expande hacia afuera y contiene la caja original", () => {
  const caja = [5.78495, -73.03015, 5.7861, -73.0291] as const;
  const [s, o, n, e] = cajaAjustada(caja, 50);
  assert(s <= caja[0] && o <= caja[1] && n >= caja[2] && e >= caja[3]);
  assert(caja[0] - s < 50 / 111320 + 1e-9);
  assertEquals(cajaAjustada(caja, 50), cajaAjustada([5.7849, -73.0301, 5.7861, -73.0291], 50));
});

Deno.test("caché negativa: un cargar que falla se llama una sola vez en dos consultas seguidas", async () => {
  const memoria = new CacheEnMemoria();
  let llamadas = 0;
  const cargar = () => {
    llamadas++;
    return Promise.resolve(Result.err(new ClimaProveedorNoDisponibleError("X", "caído")));
  };
  const r1 = await obtenerConCache<number>("neg:1", "x", 1, memoria, undefined, cargar, 60_000);
  const r2 = await obtenerConCache<number>("neg:1", "x", 1, memoria, undefined, cargar, 60_000);
  assertEquals(r1.ok, false);
  assertEquals(r2.ok, false);
  assertEquals(llamadas, 1);
});

Deno.test("caché negativa: sin ttlNegativoMs no se recuerda el error", async () => {
  const memoria = new CacheEnMemoria();
  let llamadas = 0;
  const cargar = () => {
    llamadas++;
    return Promise.resolve(Result.err(new ClimaProveedorNoDisponibleError("X", "caído")));
  };
  await obtenerConCache<number>("neg:2", "x", 1, memoria, undefined, cargar);
  await obtenerConCache<number>("neg:2", "x", 1, memoria, undefined, cargar);
  assertEquals(llamadas, 2);
});

Deno.test("LimitadorConcurrencia: nunca supera el máximo simultáneo y respeta el orden FIFO", async () => {
  const limitador = new LimitadorConcurrencia(2);
  let activas = 0;
  let maxima = 0;
  const orden: number[] = [];
  const tarea = (n: number) =>
    limitador.ejecutar(async () => {
      orden.push(n);
      activas++;
      maxima = Math.max(maxima, activas);
      await new Promise((r) => setTimeout(r, 10));
      activas--;
      return n;
    });
  const resultados = await Promise.all([1, 2, 3, 4, 5, 6].map(tarea));
  assertEquals(resultados, [1, 2, 3, 4, 5, 6]);
  assertEquals(maxima, 2);
  assertEquals(orden, [1, 2, 3, 4, 5, 6]);
});

Deno.test("TemporizadorSistema: espera aproximadamente lo pedido", async () => {
  const t0 = performance.now();
  // Se mantiene un temporizador normal vivo para que unrefTimer no deje terminar la prueba antes de tiempo.
  const vivo = setTimeout(() => {}, 200);
  await new TemporizadorSistema().esperar(30);
  clearTimeout(vivo);
  assert(performance.now() - t0 >= 25);
});

// Fixture recortado de la respuesta real de /api/temporal/climatology/point (celda de Duitama).
const mes = (valores: number[]) => ({
  JAN: valores[0], FEB: valores[1], MAR: valores[2], APR: valores[3], MAY: valores[4], JUN: valores[5],
  JUL: valores[6], AUG: valores[7], SEP: valores[8], OCT: valores[9], NOV: valores[10], DEC: valores[11],
  ANN: 0,
});
const POWER_FIXTURE = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-73.0, 5.75, 2515.54] },
  properties: {
    parameter: {
      FROST_DAYS: mes(Array(12).fill(0)),
      PRECTOTCORR: mes([1.36, 1.96, 3.86, 5.49, 6.03, 4.65, 4.16, 4.06, 3.83, 5.91, 5.17, 2.59]),
      T2M: mes([14.18, 14.66, 14.92, 14.79, 14.44, 13.77, 13.49, 13.72, 14.0, 13.98, 14.04, 14.1]),
      T2M_MAX: mes([24.03, 25.58, 26.37, 24.96, 23.97, 23.88, 23.08, 22.79, 23.64, 23.83, 22.63, 22.83]),
      T2M_MIN: mes([2.86, 3.85, 5.08, 6.37, 5.97, 5.95, 5.19, 4.5, 5.72, 6.13, 5.65, 4.53]),
    } as Record<string, unknown>,
  },
  header: {
    fill_value: -999.0,
    range: "25-year Meteorological and Solar Monthly & Annual Climatologies (January 2001 - December 2025)",
  },
};

Deno.test("parsearClimatologiaPower: 12 meses, lluvia mensual = mm/día x días, periodo y altitud", () => {
  const c = parsearClimatologiaPower(POWER_FIXTURE)!;
  assertEquals(c.meses.length, 12);
  assertEquals(c.periodo, "2001-2025");
  assertEquals(c.altitudCeldaM, 2515.54);
  assertEquals(c.meses[0].lluviaMm, 42.2); // 1,36 x 31
  assertEquals(c.meses[1].lluviaMm, 55.4); // 1,96 x 28,25
  assertEquals(c.meses[0].diasHelada, 0);
  assertEquals(c.meses[2].tempMinC, 5.08);
});

Deno.test("parsearClimatologiaPower: sin FROST_DAYS deja diasHelada null; sin parámetros devuelve null", () => {
  const sinHelada = structuredClone(POWER_FIXTURE);
  delete sinHelada.properties.parameter.FROST_DAYS;
  assertEquals(parsearClimatologiaPower(sinHelada)!.meses[0].diasHelada, null);
  assertEquals(parsearClimatologiaPower({ properties: { parameter: {} } }), null);
  assertEquals(parsearClimatologiaPower(null), null);
});

Deno.test("país del punto: Duitama 170, Nakuru 404, Córdoba 724, Ames 840, mar abierto null", async () => {
  const c = new PresenciaLocalClient({ directorioCache: Deno.makeTempDirSync() });
  assertEquals((await c.paisDelPunto(5.785, -73.03))?.m49, "170");
  assertEquals((await c.paisDelPunto(-0.27, 36.15))?.m49, "404");
  assertEquals((await c.paisDelPunto(37.85, -4.85))?.m49, "724");
  assertEquals((await c.paisDelPunto(42.008, -93.7))?.m49, "840");
  assertEquals(await c.paisDelPunto(0, -30), null);
});

Deno.test("alias EVA: normaliza tildes, mayúsculas y nombres compuestos", () => {
  assertEquals(claveDesdeNombreEva("Cebolla de bulbo"), "cebolla_bulbo");
  assertEquals(claveDesdeNombreEva("CEBOLLA DE BULBO"), "cebolla_bulbo");
  assertEquals(claveDesdeNombreEva("Maíz"), "maiz");
  assertEquals(claveDesdeNombreEva("MAIZ"), "maiz");
  assertEquals(claveDesdeNombreEva("Calabacín, calabaza"), "calabaza");
  assertEquals(claveDesdeNombreEva("Ahuyama"), "calabaza");
  assertEquals(claveDesdeNombreEva("Fríjol caupi"), "caupi");
  assertEquals(claveDesdeNombreEva("Frijol caupi"), "caupi");
  assertEquals(claveDesdeNombreEva("Ajonjolí"), "sesamo");
  assertEquals(claveDesdeNombreEva("Pimentón"), "pimiento");
  assertEquals(claveDesdeNombreEva("Mora"), null);
  assertEquals(Object.keys(ALIAS_EVA).length, 40);
});

Deno.test("presencia de Kenia (FAOSTAT): incluye maíz, fuente y periodo", async () => {
  const c = new PresenciaLocalClient({ directorioCache: Deno.makeTempDirSync() });
  const r = await c.obtenerPresencia(-0.27, 36.15);
  assert(r.ok && r.value !== null);
  const p = r.value!;
  assertEquals(p.fuente, "FAOSTAT");
  assertEquals(p.periodo, "2018-2022");
  assertEquals(p.pais, p.ambito);
  assert(p.areaPorCultivo.maiz > 0);
  assert(p.cultivosCubiertos.includes("maiz"));
  assert(p.valorProduccionHaPais.maiz > 0);
});

Deno.test("presencia en el mar: Result.ok(null) sin tocar la red", async () => {
  const c = new PresenciaLocalClient({ directorioCache: Deno.makeTempDirSync() });
  const r = await c.obtenerPresencia(0, -30);
  assert(r.ok);
  assertEquals(r.value, null);
});
