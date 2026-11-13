/**
 * Geometrías en WKT para MySQL 8 con SRID 4326.
 * Convención ÚNICA del proyecto: el WKT se escribe "lon lat" y se indica 'axis-order=long-lat' al escribir y al leer
 * (sin esa opción MySQL espera (lat, lon) para SRID 4326). Los puntos del dominio son [lat, lon].
 */
import type { LatLon } from "@agrocore/core";

/** Cajas [sur, oeste, norte, este]. */
export type Caja = readonly [number, number, number, number];

const par = (p: LatLon) => p[1] + " " + p[0];

export function wktLinea(puntos: readonly LatLon[]): string | null {
  if (puntos.length < 2) return null;
  return "LINESTRING(" + puntos.map(par).join(",") + ")";
}

/** Anillo cerrado (se cierra si no lo está). null si no alcanza para un polígono (< 3 puntos distintos). */
export function wktPoligono(anillo: readonly LatLon[]): string | null {
  if (anillo.length < 3) return null;
  const cerrado = anillo[0][0] === anillo[anillo.length - 1][0] && anillo[0][1] === anillo[anillo.length - 1][1]
    ? [...anillo]
    : [...anillo, anillo[0]];
  if (cerrado.length < 4) return null;
  return "POLYGON((" + cerrado.map(par).join(",") + "))";
}

export function wktCaja(caja: Caja): string {
  const [s, o, n, e] = caja;
  return wktPoligono([[s, o], [s, e], [n, e], [n, o]])!;
}

/** Lee un WKT "lon lat" (LINESTRING o POLYGON; de un polígono toma el anillo exterior) y devuelve puntos [lat, lon]. */
export function parsearWkt(wkt: string): LatLon[] {
  const abre = wkt.indexOf("(");
  const cuerpo = wkt.slice(abre).replace(/^\(+/, "");
  const primero = cuerpo.split(")")[0];
  const puntos: LatLon[] = [];
  for (const texto of primero.split(",")) {
    const [lon, lat] = texto.trim().split(/\s+/).map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon)) puntos.push([lat, lon]);
  }
  return puntos;
}

/** Expresión SQL para construir una geometría desde un WKT "lon lat". */
export const GEOM_DESDE_WKT = "ST_GeomFromText(?, 4326, 'axis-order=long-lat')";
