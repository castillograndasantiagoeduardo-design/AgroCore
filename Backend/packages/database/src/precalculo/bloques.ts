/**
 * Cómo se parte la región en bloques (lo usan el script de precálculo y los repositorios, para coincidir).
 */
import type { Caja } from "./geo-sql.ts";

/** Lado de los bloques de vías/edificaciones/agua, en grados. */
export const BLOQUE_VIAS_GRADOS = 0.1;
/** Paso de la grilla de elevación, en grados (0,01° ≈ 1,1 km). */
export const PASO_ELEVACION_GRADOS = 0.01;

const EPS = 1e-9;

export const TIPO_BLOQUE = {
  clima: "clima",
  vias: "vias",
  cobertura: "cobertura",
  elevacion: "elevacion",
  presencia: "presencia",
} as const;
export type TipoBloque = keyof typeof TIPO_BLOQUE;

/** Claves "i:j" de los bloques de vías que tocan la caja (grilla alineada a 0°). */
export function clavesBloquesVias(caja: Caja, lado = BLOQUE_VIAS_GRADOS): string[] {
  const [s, o, n, e] = caja;
  const claves: string[] = [];
  const i0 = Math.floor(s / lado + EPS);
  const j0 = Math.floor(o / lado + EPS);
  const i1 = Math.max(i0, Math.floor(n / lado - EPS));
  const j1 = Math.max(j0, Math.floor(e / lado - EPS));
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) claves.push(i + ":" + j);
  }
  return claves;
}

/** Caja [sur, oeste, norte, este] de un bloque "i:j". */
export function cajaDeBloqueVias(clave: string, lado = BLOQUE_VIAS_GRADOS): Caja {
  const [i, j] = clave.split(":").map(Number);
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return [r(i * lado), r(j * lado), r((i + 1) * lado), r((j + 1) * lado)];
}

/** Índice de la grilla de elevación de una coordenada. */
export function indiceElevacion(grados: number, paso = PASO_ELEVACION_GRADOS): number {
  return Math.round(grados / paso);
}
