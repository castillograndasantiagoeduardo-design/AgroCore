/**
 * Ventanas de siembra de la rotación (servicio de dominio puro).
 *
 * Hay dos por año: la del primer semestre (candidatos marzo/abril) y la del segundo
 * (candidatos septiembre/octubre). Se elige el primer candidato que el perfil climático marca como lluvioso.
 */
import type { Temporada, VentanaSiembraDto } from "@agrocore/contracts";
import { NOMBRES_MES } from "../../../clima/domain/services/calendario-climatico.service.ts";

/** Meses candidatos por semestre del año, en orden de preferencia. */
export const MESES_CANDIDATOS_VENTANA: Record<1 | 2, readonly number[]> = { 1: [3, 4], 2: [9, 10] };

export interface MesTemporada {
  mes: number;
  temporada: Temporada;
}

export interface ResultadoVentanas {
  ventanas: VentanaSiembraDto[];
  /** Una advertencia por cada ventana que no coincide con lluvias. */
  advertencias: string[];
}

export function calcularVentanasSiembra(meses: readonly MesTemporada[]): ResultadoVentanas {
  const ventanas: VentanaSiembraDto[] = [];
  const advertencias: string[] = [];
  for (const semestreDelAnio of [1, 2] as const) {
    const candidatos = MESES_CANDIDATOS_VENTANA[semestreDelAnio];
    const lluvioso = candidatos.find((c) => meses.find((m) => m.mes === c)?.temporada === "lluviosa");
    const mesSiembra = lluvioso ?? candidatos[0];
    ventanas.push({
      semestreDelAnio,
      mesSiembra,
      nombreMes: NOMBRES_MES[mesSiembra - 1],
      coincideConLluvias: lluvioso !== undefined,
    });
    if (lluvioso === undefined) {
      advertencias.push(
        "Ningún mes candidato (" + candidatos.map((c) => NOMBRES_MES[c - 1]).join(" o ") +
          ") de la ventana de siembra del semestre " + semestreDelAnio + " es lluvioso según el perfil climático; se usó " +
          NOMBRES_MES[mesSiembra - 1] + " por defecto.",
      );
    }
  }
  return { ventanas, advertencias };
}

/** Meses que hay desde una siembra hasta la siguiente (marzo→octubre = 7; octubre→marzo = 5). Si coinciden, 12. */
export function mesesEntreSiembras(mesSiembra: number, mesSiguiente: number): number {
  const d = (((mesSiguiente - mesSiembra) % 12) + 12) % 12;
  return d === 0 ? 12 : d;
}

/** Lista de `cantidad` meses calendario desde `mesSiembra` (con vuelta de diciembre a enero), máximo 12. */
export function mesesDelCiclo(mesSiembra: number, cantidad: number): number[] {
  const n = Math.min(12, Math.max(1, cantidad));
  return Array.from({ length: n }, (_, i) => ((mesSiembra - 1 + i) % 12) + 1);
}
