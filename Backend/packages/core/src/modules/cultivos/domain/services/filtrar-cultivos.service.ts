/**
 * Servicio de dominio puro: filtra el catálogo según criterios agronómicos.
 * Lo usa ListarCultivosUseCase y lo reutilizará el motor de rotaciones (primer filtro por altitud/helada).
 */
import type { AptitudAltitud, FamiliaBotanica, Nivel, UsoCultivo } from "@duitamacrece/contracts";
import { type Cultivo, nivelAlMenos } from "../entities/cultivo.entity.ts";

export interface CriteriosCultivo {
  altitudM?: number;
  familia?: FamiliaBotanica;
  uso?: UsoCultivo;
  fijaNitrogeno?: boolean;
  toleranciaHeladaMin?: Nivel;
}

export interface CultivoFiltrado {
  cultivo: Cultivo;
  /** Solo se calcula si se pidió filtrar por altitud. */
  aptitudAltitud?: AptitudAltitud;
}

/** Orden en que se devuelven los cultivos cuando hay altitud: primero los óptimos. */
const ORDEN_APTITUD: Record<AptitudAltitud, number> = { optima: 0, posible: 1, no_apta: 2 };

export function filtrarCultivos(cultivos: readonly Cultivo[], criterios: CriteriosCultivo): CultivoFiltrado[] {
  const resultado: CultivoFiltrado[] = [];

  for (const cultivo of cultivos) {
    if (criterios.familia && !cultivo.perteneceAFamilia(criterios.familia)) continue;
    if (criterios.uso && cultivo.uso !== criterios.uso) continue;
    if (criterios.fijaNitrogeno !== undefined && cultivo.fijaNitrogeno !== criterios.fijaNitrogeno) continue;
    if (criterios.toleranciaHeladaMin && !nivelAlMenos(cultivo.toleranciaHelada, criterios.toleranciaHeladaMin)) continue;

    if (criterios.altitudM === undefined) {
      resultado.push({ cultivo });
      continue;
    }
    const aptitud = cultivo.aptitudPorAltitud(criterios.altitudM);
    if (aptitud !== "no_apta") resultado.push({ cultivo, aptitudAltitud: aptitud });
  }

  if (criterios.altitudM !== undefined) {
    // sort es estable: dentro de la misma aptitud se conserva el orden por nombre del repositorio.
    resultado.sort((a, b) => ORDEN_APTITUD[a.aptitudAltitud!] - ORDEN_APTITUD[b.aptitudAltitud!]);
  }
  return resultado;
}
