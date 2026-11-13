/**
 * Evaluación de UN paso de la rotación: un cultivo (o barbecho) en una ventana (servicio de dominio puro).
 * Calcula meses del ciclo, temperatura media y aptitud (ECOCROP), lluvia, déficit de agua, helada, calor y
 * si el ciclo cabe en la ventana (o necesita ocupar también la siguiente).
 */
import {
  CLAVE_BARBECHO,
  type NivelRiesgo,
  type PasoRotacionDto,
  type PerfilClimaticoDto,
  type TexturaSuelo,
  type VentanaRotacionDto,
} from "@agrocore/contracts";
import { NOMBRES_MES } from "../../../clima/domain/services/calendario-climatico.service.ts";
import type { Cultivo } from "../../../cultivos/domain/entities/cultivo.entity.ts";
import { ANIOS_ROTACION, mesesDesde } from "./ventanas-rotacion.service.ts";

/** Datos del sitio y su clima que necesita el motor. */
export interface ContextoMotor {
  perfil: PerfilClimaticoDto;
  /** Ventanas de UN año (se repiten en el año 2). */
  ventanas: readonly VentanaRotacionDto[];
  tieneRiego: boolean;
  suelo: { ph: number | null; textura: TexturaSuelo | null };
  pendientePct: number | null;
  mesesBaldios: readonly number[];
  /** % del área excluido por vías, edificaciones o agua (módulo terreno). */
  excluidoPct: number;
}

/** Un elemento de la secuencia: un cultivo o barbecho (null), y si continúa el del paso anterior. */
export interface ElementoSecuencia {
  cultivo: Cultivo | null;
  continua: boolean;
}

export interface PasoEvaluado {
  paso: PasoRotacionDto;
  cultivo: Cultivo | null;
  /** El ciclo cabe en la ventana (o, si `necesitaSiguiente`, en esta más la siguiente). */
  cabe: boolean;
  /** El ciclo no cabe solo en esta ventana pero sí sumando la siguiente: el paso siguiente debe continuarlo. */
  necesitaSiguiente: boolean;
  /** Agua mínima que usó la comparación (del ciclo; anual para perennes). */
  aguaMinimaMm: number;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

export function totalPasos(ctx: ContextoMotor): number {
  return ctx.ventanas.length * ANIOS_ROTACION;
}

export function ventanaDe(orden: number, ctx: ContextoMotor): VentanaRotacionDto {
  return ctx.ventanas[(orden - 1) % ctx.ventanas.length];
}

export function nivelRiesgo(hayExposicion: boolean, tolerancia: "baja" | "media" | "alta"): NivelRiesgo {
  if (!hayExposicion) return "ninguno";
  if (tolerancia === "alta") return "tolerado";
  if (tolerancia === "media") return "moderado";
  return "alto";
}

export function nombresDeMeses(meses: readonly number[]): string {
  return meses.map((m) => NOMBRES_MES[m - 1]).join(", ");
}

/** Un mes expone a helada si en ≥ 25 % de los años hiela y hay ≥ DIAS_HELADA_EXPOSICION días de helada en promedio. */
export const DIAS_HELADA_EXPOSICION = 2;

export function mesesHeladaFrecuente(perfil: PerfilClimaticoDto): number[] {
  return perfil.meses
    .filter((m) => perfil.resumen.mesesRiesgoHelada.includes(m.mes) && m.diasHeladaPromedio >= DIAS_HELADA_EXPOSICION)
    .map((m) => m.mes);
}

/** Puntaje de riesgo de sembrar `cultivo` en estos meses (menor es mejor): elige el mes de siembra dentro de la ventana. */
function riesgoSiembra(cultivo: Cultivo, meses: number[], ctx: ContextoMotor): number {
  const helada = mesesHeladaFrecuente(ctx.perfil);
  const temp = meses.reduce((s, m) => s + (ctx.perfil.meses.find((x) => x.mes === m)?.tempMediaC ?? 0), 0) / meses.length;
  const lluvia = meses.reduce((s, m) => s + (ctx.perfil.meses.find((x) => x.mes === m)?.lluviaMm ?? 0), 0);
  const rHelada = nivelRiesgo(meses.some((m) => helada.includes(m)), cultivo.toleranciaHelada);
  const rCalor = nivelRiesgo(meses.some((m) => ctx.perfil.resumen.mesesCalor.includes(m)), cultivo.toleranciaCalor);
  const aptitud = cultivo.aptitudPorTemperatura(temp);
  const peso = { ninguno: 0, tolerado: 1, moderado: 10, alto: 100 } as const;
  return (aptitud === "no_apta" ? 1000 : aptitud === "posible" ? 5 : 0) + peso[rHelada] + peso[rCalor] +
    (ctx.tieneRiego ? 0 : Math.max(0, cultivo.aguaCicloMm.min - lluvia) / 10);
}

export function evaluarPaso(cultivo: Cultivo | null, orden: number, continua: boolean, ctx: ContextoMotor): PasoEvaluado {
  const n = totalPasos(ctx);
  const v = ventanaDe(orden, ctx);
  const siguiente = orden < n ? ventanaDe(orden + 1, ctx) : null;
  const notas: string[] = [];

  let mesesCiclo: number[];
  let cabe = true;
  let necesitaSiguiente = false;
  if (cultivo === null || continua || cultivo.perenne) {
    mesesCiclo = [...v.meses];
  } else {
    const nCiclo = cultivo.mesesCicloMedio;
    // Mes de siembra: dentro de la ventana, el de menor riesgo (helada, calor, temperatura, agua); empate → el primero.
    let desfase = 0;
    if (nCiclo < v.meses.length) {
      let mejorRiesgo = Infinity;
      for (let d = 0; d <= v.meses.length - nCiclo; d++) {
        const riesgo = riesgoSiembra(cultivo, mesesDesde(v.meses[d], nCiclo), ctx);
        if (riesgo < mejorRiesgo) {
          mejorRiesgo = riesgo;
          desfase = d;
        }
      }
      if (desfase > 0) notas.push("Se siembra en " + NOMBRES_MES[v.meses[desfase] - 1] + " (no al inicio de la ventana) para reducir riesgos.");
    }
    mesesCiclo = mesesDesde(v.meses[desfase], nCiclo);
    if (nCiclo > v.meses.length) {
      if (siguiente && nCiclo <= v.meses.length + siguiente.meses.length) {
        necesitaSiguiente = true;
        notas.push(
          "Ciclo de unos " + nCiclo + " meses: ocupa esta ventana y la siguiente (" + v.meses.length + " + " + siguiente.meses.length + " meses).",
        );
      } else {
        cabe = false;
        notas.push("El ciclo dura cerca de " + nCiclo + " meses y la ventana solo tiene " + v.meses.length + ": se cosecharía tarde.");
      }
    }
  }

  const mes = (m: number) => ctx.perfil.meses.find((x) => x.mes === m);
  const tempMediaCicloC = r1(mesesCiclo.reduce((s, m) => s + (mes(m)?.tempMediaC ?? 0), 0) / mesesCiclo.length);
  const lluviaCicloMm = r1(mesesCiclo.reduce((s, m) => s + (mes(m)?.lluviaMm ?? 0), 0));
  const heladaFrecuente = mesesHeladaFrecuente(ctx.perfil);
  const mesesHeladaEnCiclo = mesesCiclo.filter((m) => heladaFrecuente.includes(m));
  const mesesCalorEnCiclo = mesesCiclo.filter((m) => ctx.perfil.resumen.mesesCalor.includes(m));

  if (cultivo === null) {
    notas.push(
      v.tipo === "intervalo"
        ? "Barbecho: el lote descansa en el intervalo (" + nombresDeMeses(v.meses) + "). Dejar rastrojo en superficie lo protege."
        : "Barbecho en temporada: el lote queda sin cultivo.",
    );
    return {
      paso: {
        orden,
        anio: orden <= ctx.ventanas.length ? 1 : 2,
        tipoVentana: v.tipo,
        cultivoClave: CLAVE_BARBECHO,
        cultivoNombre: "Barbecho",
        familias: [],
        continua: false,
        mesSiembra: v.mesInicio,
        mesCosecha: v.meses[v.meses.length - 1],
        mesesCiclo,
        tempMediaCicloC,
        aptitudClima: null,
        lluviaCicloMm,
        deficitAguaMm: 0,
        requiereRiego: false,
        mesesHeladaEnCiclo,
        riesgoHelada: "ninguno",
        mesesCalorEnCiclo,
        riesgoCalor: "ninguno",
        notas,
      },
      cultivo: null,
      cabe: true,
      necesitaSiguiente: false,
      aguaMinimaMm: 0,
    };
  }

  const aptitudClima = cultivo.aptitudPorTemperatura(tempMediaCicloC);
  const aguaMinimaMm = cultivo.aguaCicloMm.min;
  // Para un perenne el agua mínima se expresa por año: se compara con la lluvia anual.
  const lluviaComparada = cultivo.perenne ? ctx.perfil.resumen.lluviaAnualMm : lluviaCicloMm;
  const deficitAguaMm = continua ? 0 : r1(Math.max(0, aguaMinimaMm - lluviaComparada));
  const riesgoHelada = nivelRiesgo(mesesHeladaEnCiclo.length > 0, cultivo.toleranciaHelada);
  const riesgoCalor = nivelRiesgo(mesesCalorEnCiclo.length > 0, cultivo.toleranciaCalor);

  if (continua) notas.push(cultivo.perenne ? "Continúa la pradera: no se vuelve a sembrar." : "Continúa el cultivo sembrado en la ventana anterior.");
  if (cultivo.perenne && !continua) notas.push("Para un perenne el agua mínima (" + aguaMinimaMm + " mm/año) se compara con la lluvia anual.");
  if (deficitAguaMm > 0 && ctx.tieneRiego) notas.push("Falta agua de lluvia (" + deficitAguaMm + " mm): se cubriría con riego.");
  if (aptitudClima === "posible") notas.push("Temperatura media del ciclo (" + tempMediaCicloC + " °C) fuera del óptimo del cultivo: rendimiento menor.");

  return {
    paso: {
      orden,
      anio: orden <= ctx.ventanas.length ? 1 : 2,
      tipoVentana: v.tipo,
      cultivoClave: cultivo.clave,
      cultivoNombre: cultivo.nombre,
      familias: [...cultivo.familias],
      continua,
      mesSiembra: mesesCiclo[0],
      mesCosecha: mesesCiclo[mesesCiclo.length - 1],
      mesesCiclo,
      tempMediaCicloC,
      aptitudClima,
      lluviaCicloMm,
      deficitAguaMm,
      requiereRiego: deficitAguaMm > 0,
      mesesHeladaEnCiclo,
      riesgoHelada,
      mesesCalorEnCiclo,
      riesgoCalor,
      notas,
    },
    cultivo,
    cabe,
    necesitaSiguiente,
    aguaMinimaMm,
  };
}
