/**
 * Región del precálculo (variable de entorno REGION_PRECALCULO).
 *
 * Formato: "clima=<sur>,<oeste>,<norte>,<este>;detalle=<sur>,<oeste>,<norte>,<este>" (grados).
 *   clima   = celdas de NASA POWER cuyo centro cae dentro (serie diaria de 30 años).
 *   detalle = vías/edificaciones/agua, cobertura MODIS, elevación y presencia (respuesta instantánea completa).
 * Si falta una de las dos partes se usa la de por defecto.
 */

/** [sur, oeste, norte, este] en grados. */
export type CajaGeo = readonly [number, number, number, number];

export interface RegionPrecalculo {
  clima: CajaGeo;
  detalle: CajaGeo;
}

/** Colombia continental y Boyacá. */
export const REGION_PRECALCULO_POR_DEFECTO: RegionPrecalculo = {
  clima: [-4.3, -79.1, 12.6, -66.8],
  detalle: [4.6, -74.7, 7.15, -71.9],
};

function parsearCaja(texto: string, nombre: string): CajaGeo {
  const valores = texto.split(",").map((v) => Number(v.trim()));
  if (valores.length !== 4 || valores.some((v) => !Number.isFinite(v))) {
    throw new Error("[CONFIG] REGION_PRECALCULO: '" + nombre + "' necesita 4 números: sur,oeste,norte,este.");
  }
  const [s, o, n, e] = valores;
  if (s < -90 || n > 90 || o < -180 || e > 180 || s >= n || o >= e) {
    throw new Error("[CONFIG] REGION_PRECALCULO: '" + nombre + "' tiene límites inválidos (sur < norte, oeste < este, en grados).");
  }
  return [s, o, n, e];
}

/** Lee REGION_PRECALCULO. Sin valor (o vacío) devuelve la región por defecto; con formato inválido lanza (Fail-Fast). */
export function parsearRegionPrecalculo(texto: string | undefined | null): RegionPrecalculo {
  const region: { clima: CajaGeo; detalle: CajaGeo } = { ...REGION_PRECALCULO_POR_DEFECTO };
  if (!texto || texto.trim() === "") return region;
  for (const parte of texto.split(";")) {
    if (parte.trim() === "") continue;
    const igual = parte.indexOf("=");
    const nombre = (igual < 0 ? "" : parte.slice(0, igual)).trim().toLowerCase();
    if (nombre !== "clima" && nombre !== "detalle") {
      throw new Error("[CONFIG] REGION_PRECALCULO: se esperaba 'clima=...' o 'detalle=...', llegó '" + parte.trim() + "'.");
    }
    region[nombre] = parsearCaja(parte.slice(igual + 1), nombre);
  }
  return region;
}

export function puntoEnCaja(latitud: number, longitud: number, caja: CajaGeo): boolean {
  return latitud >= caja[0] && latitud <= caja[2] && longitud >= caja[1] && longitud <= caja[3];
}
