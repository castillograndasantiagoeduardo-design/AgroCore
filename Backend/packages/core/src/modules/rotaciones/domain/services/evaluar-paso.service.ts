/**
 * Evaluación de UN paso de la rotación: un cultivo en un semestre (servicio de dominio puro).
 * Calcula meses del ciclo, lluvia, déficit de agua, helada y si el ciclo cabe antes de la siguiente siembra.
 */
import type { PasoRotacionDto, PerfilClimaticoDto, RiesgoHelada, VentanaSiembraDto } from "@agrocore/contracts";
import { NOMBRES_MES } from "../../../clima/domain/services/calendario-climatico.service.ts";
import type { Cultivo } from "../../../cultivos/domain/entities/cultivo.entity.ts";
import { mesesDelCiclo, mesesEntreSiembras } from "./ventanas-siembra.service.ts";

/** Datos de la finca y su clima que necesita el motor. */
export interface ContextoMotor {
  perfil: PerfilClimaticoDto;
  ventanas: readonly VentanaSiembraDto[];
  altitudM: number;
  tieneRiego: boolean;
}

export interface PasoEvaluado {
  paso: PasoRotacionDto;
  cabeEnVentana: boolean;
  /** Agua mínima que usó la comparación (del ciclo; anual para perennes). */
  aguaMinimaMm: number;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** true si `actual` continúa la pradera perenne que ya estaba en el semestre anterior. */
export function continuaPradera(anterior: Cultivo | null, actual: Cultivo): boolean {
  return anterior !== null && anterior.clave === actual.clave && actual.perenne;
}

export function mesesCicloNecesarios(cultivo: Cultivo): number {
  return Math.ceil((cultivo.cicloDias.min + cultivo.cicloDias.max) / 2 / 30);
}

export function riesgoHeladaPorTolerancia(hayMesesHelada: boolean, tolerancia: Cultivo["toleranciaHelada"]): RiesgoHelada {
  if (!hayMesesHelada) return "ninguno";
  if (tolerancia === "alta") return "tolerado";
  if (tolerancia === "media") return "moderado";
  return "alto";
}

export function evaluarPaso(cultivo: Cultivo, semestre: number, continua: boolean, ctx: ContextoMotor): PasoEvaluado {
  const delAnio = ((semestre - 1) % 2) as 0 | 1;
  const ventana = ctx.ventanas[delAnio];
  const siguiente = ctx.ventanas[(delAnio + 1) % 2];
  const mesesHastaSiguiente = mesesEntreSiembras(ventana.mesSiembra, siguiente.mesSiembra);
  const nCiclo = mesesCicloNecesarios(cultivo);

  const mesesCiclo = continua
    ? mesesDelCiclo(ventana.mesSiembra, mesesHastaSiguiente)
    : mesesDelCiclo(ventana.mesSiembra, nCiclo);
  const cabeEnVentana = continua || nCiclo <= mesesHastaSiguiente;

  const lluviaDe = (mes: number) => ctx.perfil.meses.find((m) => m.mes === mes)?.lluviaMm ?? 0;
  const lluviaCicloMm = r1(mesesCiclo.reduce((s, m) => s + lluviaDe(m), 0));
  const aguaMinimaMm = cultivo.toSnapshot().aguaCicloMm.min;
  // Para un perenne el agua mínima se expresa por año: se compara con la lluvia anual.
  const lluviaComparada = cultivo.perenne ? ctx.perfil.resumen.lluviaAnualMm : lluviaCicloMm;
  const deficitAguaMm = r1(Math.max(0, aguaMinimaMm - lluviaComparada));

  const tempDe = (mes: number) => ctx.perfil.meses.find((m) => m.mes === mes)?.tempMediaC ?? 0;
  const tempMediaCicloC = r1(mesesCiclo.reduce((s, m) => s + tempDe(m), 0) / mesesCiclo.length);
  const aptitudClima = cultivo.aptitudPorTemperatura(tempMediaCicloC);
  const mesesHeladaEnCiclo = mesesCiclo.filter((m) => ctx.perfil.resumen.mesesRiesgoHelada.includes(m));
  const riesgoHelada = riesgoHeladaPorTolerancia(mesesHeladaEnCiclo.length > 0, cultivo.toleranciaHelada);

  const notas: string[] = [];
  if (continua) notas.push("Continúa la pradera sembrada en el semestre anterior: no se vuelve a sembrar.");
  if (!cabeEnVentana) {
    notas.push(
      "El ciclo dura cerca de " + nCiclo + " meses y solo hay " + mesesHastaSiguiente +
        " hasta la siguiente siembra: se cosecharía después de esa siembra.",
    );
  }
  if (cultivo.perenne) {
    notas.push("Para una pradera perenne el agua mínima (" + aguaMinimaMm + " mm) se compara con la lluvia de todo el año.");
  }
  if (deficitAguaMm > 0 && ctx.tieneRiego) {
    notas.push("Falta agua de lluvia (" + deficitAguaMm + " mm): se cubriría con el riego de la finca.");
  }

  return {
    paso: {
      semestre,
      anio: semestre <= 2 ? 1 : 2,
      cultivoClave: cultivo.clave,
      cultivoNombre: cultivo.nombre,
      familias: [...cultivo.familias],
      continuaPradera: continua,
      mesSiembra: ventana.mesSiembra,
      mesCosecha: mesesCiclo[mesesCiclo.length - 1],
      mesesCiclo,
      lluviaCicloMm,
      deficitAguaMm,
      requiereRiego: deficitAguaMm > 0,
      tempMediaCicloC,
      aptitudClima,
      mesesHeladaEnCiclo,
      riesgoHelada,
      notas,
    },
    cabeEnVentana,
    aguaMinimaMm,
  };
}

export function nombresDeMeses(meses: readonly number[]): string {
  return meses.map((m) => NOMBRES_MES[m - 1]).join(", ");
}
