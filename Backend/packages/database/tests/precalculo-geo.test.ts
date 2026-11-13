/**
 * Tests sin red ni MySQL de la geometría del precálculo: proyección sinusoidal de MODIS, índice de píxel,
 * bloques de vías, WKT (orden lon lat) y gzip. Los tests contra MySQL se saltan solos si no hay conexión.
 */
import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import {
  aSinusoidal,
  cajaDeBloqueVias,
  clavesBloquesVias,
  comprimirJson,
  deSinusoidal,
  descomprimirJson,
  indiceCeldaPower,
  indiceElevacion,
  indicePixel,
  parsearWkt,
  wktCaja,
  wktLinea,
  wktPoligono,
} from "../src/index.ts";

Deno.test("sinusoidal: x = R·λ·cos φ, y = R·φ (R = 6371007.181 m)", () => {
  const { x, y } = aSinusoidal(5.78, -73.03);
  assertAlmostEquals(y, 6371007.181 * (5.78 * Math.PI) / 180, 1e-6);
  assertAlmostEquals(x, 6371007.181 * (-73.03 * Math.PI) / 180 * Math.cos((5.78 * Math.PI) / 180), 1e-6);
  assertAlmostEquals(aSinusoidal(0, 0).x, 0, 1e-9);
  assertAlmostEquals(aSinusoidal(0, 90).x, 6371007.181 * Math.PI / 2, 1e-6);
});

Deno.test("sinusoidal: la inversa devuelve el mismo punto", () => {
  const { x, y } = aSinusoidal(5.785, -73.03);
  const p = deSinusoidal(x, y);
  assertAlmostEquals(p.latitud, 5.785, 1e-9);
  assertAlmostEquals(p.longitud, -73.03, 1e-9);
});

Deno.test("sinusoidal: coincide con el subset real de ORNL (centro 5.78,-73.03 en xll=-8172373.03, yll=549952.16)", () => {
  // Rejilla real del subset de 401x401 píxeles; el centro pedido cae en el píxel central (200, 200).
  const rejilla = { xll: -8172373.03, yll: 549952.16, cellsize: 463.312716528, nrows: 401, ncols: 401 };
  const { x, y } = aSinusoidal(5.78, -73.03);
  const p = indicePixel(rejilla, x, y);
  assert(p);
  assert(Math.abs(p.fila - 200) <= 1 && Math.abs(p.columna - 200) <= 1, "píxel central, fue " + JSON.stringify(p));
});

Deno.test("indicePixel: la fila 0 es el norte; fuera de la rejilla devuelve null", () => {
  const r = { xll: 0, yll: 0, cellsize: 10, nrows: 3, ncols: 4 };
  assertEquals(indicePixel(r, 5, 25), { fila: 0, columna: 0 }); // arriba a la izquierda
  assertEquals(indicePixel(r, 35, 5), { fila: 2, columna: 3 }); // abajo a la derecha
  assertEquals(indicePixel(r, -1, 5), null);
  assertEquals(indicePixel(r, 5, 30), null);
  assertEquals(indicePixel(r, 40, 5), null);
});

Deno.test("clavesBloquesVias: bloques de 0,1° que tocan la caja; ida y vuelta con cajaDeBloqueVias", () => {
  assertEquals(clavesBloquesVias([5.783, -73.032, 5.787, -73.028]), ["57:-731"]);
  assertEquals(clavesBloquesVias([5.79, -73.02, 5.81, -72.98]).sort(), ["57:-730", "57:-731", "58:-730", "58:-731"]);
  assertEquals(cajaDeBloqueVias("57:-731"), [5.7, -73.1, 5.8, -73]);
  // una caja que coincide exactamente con un bloque no arrastra a los vecinos
  assertEquals(clavesBloquesVias([5.7, -73.1, 5.8, -73]), ["57:-731"]);
});

Deno.test("indiceElevacion e indiceCeldaPower", () => {
  assertEquals(indiceElevacion(5.785), 579);
  assertEquals(indiceElevacion(-73.03), -7303);
  assertEquals(indiceCeldaPower(5.785, -73.03), { i: 191, j: 171 });
});

Deno.test("WKT: se escribe 'lon lat' y se lee de vuelta como [lat, lon]", () => {
  assertEquals(wktLinea([[5.78, -73.03], [5.79, -73.02]]), "LINESTRING(-73.03 5.78,-73.02 5.79)");
  assertEquals(wktLinea([[5.78, -73.03]]), null);
  assertEquals(wktPoligono([[1, 2], [1, 3]]), null);
  assertEquals(wktPoligono([[1, 2], [1, 3], [2, 3]]), "POLYGON((2 1,3 1,3 2,2 1))"); // lo cierra
  assertEquals(wktCaja([5.7, -73.1, 5.8, -73]), "POLYGON((-73.1 5.7,-73 5.7,-73 5.8,-73.1 5.8,-73.1 5.7))");
  assertEquals(parsearWkt("LINESTRING(-73.03 5.78,-73.02 5.79)"), [[5.78, -73.03], [5.79, -73.02]]);
  assertEquals(parsearWkt("POLYGON((2 1,3 1,3 2,2 1),(2.1 1.1,2.2 1.1,2.2 1.2,2.1 1.1))"), [[1, 2], [1, 3], [2, 3], [1, 2]]);
});

Deno.test("gzip: ida y vuelta de un JSON", async () => {
  const valor = { fuente: "NASA POWER", altitudCeldaM: 2500, registros: Array.from({ length: 500 }, (_, i) => ({ fecha: "2020-01-01", lluviaMm: i })) };
  const bytes = await comprimirJson(valor);
  assert(bytes.length < JSON.stringify(valor).length / 3, "comprime");
  assertEquals(await descomprimirJson(bytes), valor);
});

// ---------- Con MySQL (se salta solo si no hay conexión o no se aplicó la migración 006) ----------

Deno.test({
  name: "MySQL: WKT lon-lat + MBRIntersects devuelve la vía insertada y no la lejana",
  ignore: !Deno.env.get("DB_HOST"),
  async fn() {
    const mysql = (await import("mysql2/promise")).default;
    let conexion;
    try {
      conexion = await mysql.createConnection({
        host: Deno.env.get("DB_HOST"),
        port: Number(Deno.env.get("DB_PORT")),
        user: Deno.env.get("DB_USER"),
        password: Deno.env.get("DB_PASSWORD") ?? "",
        database: Deno.env.get("DB_NAME"),
      });
      await conexion.query("SELECT 1 FROM vias_region LIMIT 1");
    } catch {
      console.warn("  (sin MySQL o sin migración 006: prueba omitida)");
      await conexion?.end().catch(() => {});
      return;
    }
    try {
      await conexion.query("START TRANSACTION");
      const osmId = -987654321; // id negativo: nunca choca con uno real
      await conexion.query(
        "INSERT INTO vias_region (osm_id, tipo, nombre, geom) VALUES (?, 'test', 'prueba', ST_GeomFromText(?, 4326, 'axis-order=long-lat'))",
        [osmId, wktLinea([[5.785, -73.03], [5.786, -73.029]])],
      );
      const consulta = (caja: [number, number, number, number]) =>
        conexion!.query(
          "SELECT ST_AsText(geom, 'axis-order=long-lat') AS wkt FROM vias_region WHERE osm_id = ? AND MBRIntersects(geom, ST_GeomFromText(?, 4326, 'axis-order=long-lat'))",
          [osmId, wktCaja(caja)],
        ) as unknown as Promise<[{ wkt: string }[]]>;
      const [cerca] = await consulta([5.784, -73.031, 5.787, -73.028]);
      const [lejos] = await consulta([5.9, -73.031, 5.91, -73.028]);
      assertEquals(cerca.length, 1);
      assertEquals(parsearWkt(cerca[0].wkt)[0], [5.785, -73.03]);
      assertEquals(lejos.length, 0);
    } finally {
      await conexion.query("ROLLBACK");
      await conexion.end();
    }
  },
});
