/**
 * Resumen anual del perfil climático (servicio de dominio puro): régimen de lluvias, aridez y meses críticos.
 *
 * Régimen de lluvias:
 *   arido     → índice de aridez (lluvia anual / ET0 anual) < 0,2 (UNESCO).
 *   uniforme  → el mes más lluvioso no llega al doble del más seco (no hay estación seca marcada).
 *   bimodal   → hay 2 o más tramos de ≥ 2 meses "lluviosos" (lluvia ≥ promedio mensual) separados entre sí.
 *   unimodal  → el resto (una sola estación de lluvias).
 */
import type { ClimaMensualDto, RegimenLluvias } from "@agrocore/contracts";
import { tramosCirculares } from "./temporadas-cultivo.service.ts";

export const ARIDEZ_ARIDO = 0.2;
/** Mes con estrés por calor: al menos estos días con Tmáx ≥ umbral. */
export const DIAS_CALOR_MES_CRITICO = 5;
/** Mes con déficit hídrico: lluvia < esta fracción de la ET0. */
export const FRACCION_DEFICIT = 0.5;
/** Mes de lluvia extrema: al menos estos días de lluvia fuerte en promedio. */
export const DIAS_LLUVIA_EXTREMA = 1.5;

export function indiceAridez(meses: readonly ClimaMensualDto[]): number {
  const lluvia = meses.reduce((s, m) => s + m.lluviaMm, 0);
  const eto = meses.reduce((s, m) => s + m.etoMm, 0);
  return eto > 0 ? Math.round((lluvia / eto) * 100) / 100 : 0;
}

export function regimenLluvias(meses: readonly ClimaMensualDto[]): RegimenLluvias {
  if (indiceAridez(meses) < ARIDEZ_ARIDO) return "arido";
  const lluvias = meses.map((m) => m.lluviaMm);
  const max = Math.max(...lluvias);
  const min = Math.min(...lluvias);
  if (max < 2 * Math.max(min, 1)) return "uniforme";
  const lluviosos = new Set(meses.filter((m) => m.temporada === "lluviosa").map((m) => m.mes));
  const tramos = tramosCirculares(lluviosos).filter((t) => t.length >= 2);
  return tramos.length >= 2 ? "bimodal" : "unimodal";
}

export function mesesCriticos(meses: readonly ClimaMensualDto[]): {
  mesesCalor: number[];
  mesesDeficitHidrico: number[];
  mesesLluviaExtrema: number[];
} {
  return {
    mesesCalor: meses.filter((m) => m.diasCalorPromedio >= DIAS_CALOR_MES_CRITICO).map((m) => m.mes),
    mesesDeficitHidrico: meses.filter((m) => m.etoMm > 0 && m.lluviaMm < FRACCION_DEFICIT * m.etoMm).map((m) => m.mes),
    mesesLluviaExtrema: meses.filter((m) => m.diasLluviaFuertePromedio >= DIAS_LLUVIA_EXTREMA).map((m) => m.mes),
  };
}
