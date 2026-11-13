/**
 * Proyección sinusoidal de MODIS (esfera de R = 6371007.181 m): x = R·λ·cos φ; y = R·φ (radianes).
 * Cada bloque de cobertura guarda su esquina inferior izquierda (xll, yll) y el tamaño de píxel; los datos van
 * por filas, con la fila 0 al norte.
 */
export const RADIO_MODIS_M = 6371007.181;

export function aSinusoidal(latitud: number, longitud: number): { x: number; y: number } {
  const phi = (latitud * Math.PI) / 180;
  const lambda = (longitud * Math.PI) / 180;
  return { x: RADIO_MODIS_M * lambda * Math.cos(phi), y: RADIO_MODIS_M * phi };
}

/** Inversa (para ubicar el centro de un píxel). */
export function deSinusoidal(x: number, y: number): { latitud: number; longitud: number } {
  const phi = y / RADIO_MODIS_M;
  return { latitud: (phi * 180) / Math.PI, longitud: ((x / (RADIO_MODIS_M * Math.cos(phi))) * 180) / Math.PI };
}

export interface RejillaModis {
  xll: number;
  yll: number;
  cellsize: number;
  nrows: number;
  ncols: number;
}

/** Posición (fila desde el norte, columna) del píxel que contiene (x, y), o null si cae fuera de la rejilla. */
export function indicePixel(r: RejillaModis, x: number, y: number): { fila: number; columna: number } | null {
  const columna = Math.floor((x - r.xll) / r.cellsize);
  const desdeSur = Math.floor((y - r.yll) / r.cellsize);
  const fila = r.nrows - 1 - desdeSur;
  if (columna < 0 || columna >= r.ncols || fila < 0 || fila >= r.nrows) return null;
  return { fila, columna };
}
