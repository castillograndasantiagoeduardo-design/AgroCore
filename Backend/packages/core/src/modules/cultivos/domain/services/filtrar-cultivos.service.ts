/**
 * Servicio de dominio puro: filtra el catálogo según criterios agronómicos del SITIO.
 * Lo usa ListarCultivosUseCase y el motor de rotaciones (primer filtro por clima y suelo).
 *
 * Criterios (todos opcionales, se combinan con Y):
 *   - tempMediaC: temperatura media del sitio → solo cultivos con aptitud "optima" o "posible" (óptimos primero).
 *   - lluviaAnualMm: descarta los que, sin riego, necesitan claramente más agua (lluvia < 50 % del mínimo
 *     óptimo ECOCROP y tolerancia a la sequía no alta).
 *   - ph y textura del suelo (cuando se conocen): descarta pH a más de 1 unidad del óptimo y texturas no aptas.
 */
import type { AptitudClima, FamiliaBotanica, GrupoCultivo, Nivel, TexturaSuelo, UsoCultivo } from "@agrocore/contracts";
import { type Cultivo, nivelAlMenos } from "../entities/cultivo.entity.ts";

export interface CriteriosCultivo {
  tempMediaC?: number;
  lluviaAnualMm?: number;
  ph?: number;
  textura?: TexturaSuelo;
  familia?: FamiliaBotanica;
  uso?: UsoCultivo;
  grupo?: GrupoCultivo;
  fijaNitrogeno?: boolean;
  toleranciaHeladaMin?: Nivel;
}

export interface CultivoFiltrado {
  cultivo: Cultivo;
  /** Solo se calcula si se pidió filtrar por temperatura. */
  aptitudClima?: AptitudClima;
}

/** Fracción de la lluvia óptima mínima por debajo de la cual un cultivo no tolerante a la sequía se descarta. */
export const FRACCION_LLUVIA_MINIMA = 0.5;
/** Unidades de pH de margen respecto al óptimo. */
export const MARGEN_PH = 1;

const ORDEN_APTITUD: Record<AptitudClima, number> = { optima: 0, posible: 1, no_apta: 2 };

export function filtrarCultivos(cultivos: readonly Cultivo[], criterios: CriteriosCultivo): CultivoFiltrado[] {
  const resultado: CultivoFiltrado[] = [];

  for (const cultivo of cultivos) {
    if (criterios.familia && !cultivo.perteneceAFamilia(criterios.familia)) continue;
    if (criterios.uso && cultivo.uso !== criterios.uso) continue;
    if (criterios.grupo && cultivo.grupo !== criterios.grupo) continue;
    if (criterios.fijaNitrogeno !== undefined && cultivo.fijaNitrogeno !== criterios.fijaNitrogeno) continue;
    if (criterios.toleranciaHeladaMin && !nivelAlMenos(cultivo.toleranciaHelada, criterios.toleranciaHeladaMin)) continue;
    if (criterios.ph !== undefined && cultivo.phCompatible(criterios.ph, MARGEN_PH) === false) continue;
    if (criterios.textura && cultivo.texturaCompatible(criterios.textura) === false) continue;
    if (
      criterios.lluviaAnualMm !== undefined &&
      cultivo.toleranciaSequia !== "alta" &&
      criterios.lluviaAnualMm < FRACCION_LLUVIA_MINIMA * cultivo.lluviaAnualOptimaMm.min
    ) continue;

    if (criterios.tempMediaC === undefined) {
      resultado.push({ cultivo });
      continue;
    }
    const aptitud = cultivo.aptitudPorTemperatura(criterios.tempMediaC);
    if (aptitud !== "no_apta") resultado.push({ cultivo, aptitudClima: aptitud });
  }

  if (criterios.tempMediaC !== undefined) {
    // sort es estable: dentro de la misma aptitud se conserva el orden por nombre del repositorio.
    resultado.sort((a, b) => ORDEN_APTITUD[a.aptitudClima!] - ORDEN_APTITUD[b.aptitudClima!]);
  }
  return resultado;
}
