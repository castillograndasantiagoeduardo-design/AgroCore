/**
 * Celdas y grillas para que consultas cercanas compartan la misma entrada de caché.
 */

const METROS_POR_GRADO_LAT = 111_320;

/** Tamaño de la grilla de NASA POWER (MERRA-2): 0,5° de latitud × 0,625° de longitud. */
const PASO_LAT = 0.5;
const PASO_LON = 0.625;

export interface CeldaPower {
  i: number;
  j: number;
  /** Centro de la celda. */
  latitud: number;
  longitud: number;
  /** "i:j", estable para usar en claves de caché. */
  clave: string;
}

/** Celda de la grilla de NASA POWER que contiene el punto. Todos los puntos de la celda reciben la misma serie. */
export function celdaPower(latitud: number, longitud: number): CeldaPower {
  const i = Math.floor((latitud + 90) / PASO_LAT);
  const j = Math.floor((longitud + 180) / PASO_LON);
  return {
    i,
    j,
    latitud: redondear(-90 + (i + 0.5) * PASO_LAT),
    longitud: redondear(-180 + (j + 0.5) * PASO_LON),
    clave: i + ":" + j,
  };
}

function redondear(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

function pasoLonGrados(latitud: number, metros: number): number {
  const c = Math.max(Math.cos((latitud * Math.PI) / 180), 0.01);
  return metros / (METROS_POR_GRADO_LAT * c);
}

/** Redondea el punto a una grilla de `metros` y devuelve el centro de su celda. */
export function ajustarAMetros(latitud: number, longitud: number, metros: number): { latitud: number; longitud: number } {
  const pasoLat = metros / METROS_POR_GRADO_LAT;
  const lat = (Math.floor(latitud / pasoLat) + 0.5) * pasoLat;
  // El paso en longitud se calcula con la latitud ya ajustada, para que sea estable dentro de la celda.
  const pasoLon = pasoLonGrados(lat, metros);
  const lon = (Math.floor(longitud / pasoLon) + 0.5) * pasoLon;
  return { latitud: redondear(lat), longitud: redondear(lon) };
}

/** Expande una caja [sur, oeste, norte, este] hacia afuera hasta los bordes de la grilla de `metros`. */
export function cajaAjustada(
  caja: readonly [number, number, number, number],
  metros: number,
): [number, number, number, number] {
  const [sur, oeste, norte, este] = caja;
  const pasoLat = metros / METROS_POR_GRADO_LAT;
  // Latitud de referencia cuantizada a la grilla: el paso en longitud no cambia por variaciones diminutas de la caja.
  const latRef = (Math.floor(((sur + norte) / 2) / pasoLat) + 0.5) * pasoLat;
  const pasoLon = pasoLonGrados(latRef, metros);
  return [
    redondear(Math.floor(sur / pasoLat) * pasoLat),
    redondear(Math.floor(oeste / pasoLon) * pasoLon),
    redondear(Math.ceil(norte / pasoLat) * pasoLat),
    redondear(Math.ceil(este / pasoLon) * pasoLon),
  ];
}
