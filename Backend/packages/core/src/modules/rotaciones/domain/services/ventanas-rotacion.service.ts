/**
 * Ventanas de la rotación a partir de las TEMPORADAS REALES del sitio (servicio de dominio puro).
 * Reemplaza las ventanas fijas de marzo / septiembre del altiplano.
 *
 *  - 2 temporadas por año (trópico bimodal, riego en clima templado): 2 ventanas de "temporada"; cada una
 *    dispone de los meses que hay hasta la siguiente siembra.
 *  - 1 temporada por año (clima con invierno o con verano seco): 1 ventana de "temporada" + 1 de "intervalo"
 *    (el invierno o la estación seca), que solo admite cobertura, abono verde o barbecho viables.
 *
 * El horizonte es de 2 años: las ventanas de un año se repiten en el año 2 (siempre 4 pasos).
 */
import type { TemporadaCultivoDto, VentanaRotacionDto } from "@agrocore/contracts";
import { NOMBRES_MES } from "../../../clima/domain/services/calendario-climatico.service.ts";

export const ANIOS_ROTACION = 2;

/** `cantidad` meses calendario desde `inicio` (con vuelta de diciembre a enero), máximo 12. */
export function mesesDesde(inicio: number, cantidad: number): number[] {
  const n = Math.min(12, Math.max(1, cantidad));
  return Array.from({ length: n }, (_, i) => ((inicio - 1 + i) % 12) + 1);
}

/** Meses que hay desde una siembra hasta la siguiente (marzo→octubre = 7). Si coinciden, 12. */
export function mesesEntre(desde: number, hasta: number): number {
  const d = (((hasta - desde) % 12) + 12) % 12;
  return d === 0 ? 12 : d;
}

const abrev = (m: number) => NOMBRES_MES[m - 1].slice(0, 3).toLowerCase();
const rangoTexto = (meses: number[]) => abrev(meses[0]) + "–" + abrev(meses[meses.length - 1]);

export function construirVentanas(temporadas: readonly TemporadaCultivoDto[]): VentanaRotacionDto[] {
  const ordenadas = [...temporadas].sort((a, b) => a.inicioMes - b.inicioMes);
  if (ordenadas.length === 0) return [];

  if (ordenadas.length === 1) {
    const t = ordenadas[0];
    const largo = t.meses.length;
    if (largo >= 12) {
      return [{ indice: 1, tipo: "temporada", mesInicio: t.inicioMes, meses: mesesDesde(t.inicioMes, 12), mesesTemporada: [...t.meses], nombre: "Temporada única (todo el año)" }];
    }
    const inicioIntervalo = ((t.inicioMes - 1 + largo) % 12) + 1;
    const mesesIntervalo = mesesDesde(inicioIntervalo, 12 - largo);
    return [
      { indice: 1, tipo: "temporada", mesInicio: t.inicioMes, meses: [...t.meses], mesesTemporada: [...t.meses], nombre: "Temporada (" + rangoTexto(t.meses) + ")" },
      { indice: 2, tipo: "intervalo", mesInicio: inicioIntervalo, meses: mesesIntervalo, mesesTemporada: [], nombre: "Intervalo (" + rangoTexto(mesesIntervalo) + ")" },
    ];
  }

  // 2 temporadas: cada ventana llega hasta la siguiente siembra.
  return ordenadas.slice(0, 2).map((t, i, arr) => {
    const siguiente = arr[(i + 1) % arr.length];
    const meses = mesesDesde(t.inicioMes, mesesEntre(t.inicioMes, siguiente.inicioMes));
    return {
      indice: i + 1,
      tipo: "temporada" as const,
      mesInicio: t.inicioMes,
      meses,
      mesesTemporada: [...t.meses],
      nombre: "Temporada " + (i + 1) + " (" + rangoTexto(t.meses) + ")",
    };
  });
}
