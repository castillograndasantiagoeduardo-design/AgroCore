/**
 * Textura del suelo y pendiente del terreno (servicios de dominio puros).
 */
import type { TexturaSuelo } from "@agrocore/contracts";
import { type LatLon, metrosPorGrado } from "../../../../shared/domain/geo/geometria.ts";

/**
 * Clase de textura SIMPLIFICADA (3 grupos, los que usa el catálogo de cultivos y ECOCROP:
 * ligera / media / pesada) a partir del triángulo USDA:
 *   arcillosa → arcilla ≥ 35 %
 *   arenosa   → arena ≥ 70 % y arcilla < 15 % (arenas y arenas francas)
 *   franca    → todo lo demás (francos, franco-limosos, franco-arcillosos...)
 */
export function clasificarTextura(arenaPct: number | null, arcillaPct: number | null): TexturaSuelo | null {
  if (arenaPct === null || arcillaPct === null) return null;
  if (arcillaPct >= 35) return "arcillosa";
  if (arenaPct >= 70 && arcillaPct < 15) return "arenosa";
  return "franca";
}

/** Distancia (m) del centro a los 4 puntos vecinos con los que se calcula la pendiente (≈ un píxel SRTM). */
export const PASO_PENDIENTE_M = 30;

/** Centro y vecinos [centro, norte, sur, este, oeste] a PASO_PENDIENTE_M metros. */
export function puntosParaPendiente(centro: LatLon): LatLon[] {
  const k = metrosPorGrado(centro[0]);
  const dLat = PASO_PENDIENTE_M / k.y;
  const dLon = PASO_PENDIENTE_M / k.x;
  return [
    centro,
    [centro[0] + dLat, centro[1]],
    [centro[0] - dLat, centro[1]],
    [centro[0], centro[1] + dLon],
    [centro[0], centro[1] - dLon],
  ];
}

/**
 * Pendiente (%) por diferencias centradas: 100 · √((dz/dx)² + (dz/dy)²).
 * @param elevaciones [centro, norte, sur, este, oeste] en metros
 * @returns null si falta algún vecino
 */
export function calcularPendientePct(elevaciones: readonly (number | null)[]): number | null {
  const [, n, s, e, o] = elevaciones;
  if (n == null || s == null || e == null || o == null) return null;
  const dzdy = (n - s) / (2 * PASO_PENDIENTE_M);
  const dzdx = (e - o) / (2 * PASO_PENDIENTE_M);
  return Math.round(100 * Math.hypot(dzdx, dzdy) * 10) / 10;
}
