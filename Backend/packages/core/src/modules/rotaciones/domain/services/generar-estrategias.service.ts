/**
 * Búsqueda exhaustiva de rotaciones (servicio de dominio puro y determinista).
 *
 * Recorre todas las secuencias de 4 cultivos del catálogo (11^4 = 14.641, trivial), descarta las que
 * violan las reglas DURAS y devuelve la de mayor puntaje según la función que se le pase.
 *
 * Reglas duras: altitud apta, ciclo cabe en la ventana, helada ≠ "alto", déficit de agua ≤ 30 % del mínimo
 * (solo si la finca no tiene riego), no repetir familia (salvo continuar una pradera perenne) y
 * al menos una leguminosa que fije nitrógeno.
 */
import type { PasoRotacionDto, PrioridadesRotacion, PuntajesRotacionDto, EvaluacionReglaDto } from "@duitamacrece/contracts";
import type { Cultivo } from "../../../cultivos/domain/entities/cultivo.entity.ts";
import { type ContextoMotor, continuaPradera, evaluarPaso, type PasoEvaluado } from "./evaluar-paso.service.ts";
import { calcularPuntajes, calcularPuntajeTotal } from "./puntajes-rotacion.service.ts";
import { evaluarReglas } from "./reglas-rotacion.service.ts";

export const SEMESTRES_ROTACION = 4;
/** Déficit de agua tolerado (fracción del mínimo del cultivo) cuando la finca no tiene riego. */
export const DEFICIT_AGUA_MAXIMO = 0.3;

export interface SecuenciaEvaluada {
  cultivos: Cultivo[];
  claves: string[];
  evaluados: PasoEvaluado[];
  pasos: PasoRotacionDto[];
  reglas: EvaluacionReglaDto[];
  puntajes: PuntajesRotacionDto;
  puntajeTotal: number;
}

/** Evalúa pasos, reglas y puntajes de una secuencia de 4 cultivos. */
export function evaluarSecuencia(cultivos: Cultivo[], ctx: ContextoMotor, prioridades: PrioridadesRotacion): SecuenciaEvaluada {
  const evaluados = cultivos.map((c, i) => evaluarPaso(c, i + 1, continuaPradera(i > 0 ? cultivos[i - 1] : null, c), ctx));
  const puntajes = calcularPuntajes(cultivos, evaluados, ctx.tieneRiego);
  return {
    cultivos,
    claves: cultivos.map((c) => c.clave),
    evaluados,
    pasos: evaluados.map((e) => e.paso),
    reglas: evaluarReglas(cultivos, evaluados, ctx),
    puntajes,
    puntajeTotal: calcularPuntajeTotal(puntajes, prioridades),
  };
}

/** Un paso es viable si cumple las reglas duras que dependen de ese solo semestre. */
export function pasoEsViable(cultivo: Cultivo, ev: PasoEvaluado, ctx: ContextoMotor): boolean {
  if (cultivo.aptitudPorAltitud(ctx.altitudM) === "no_apta") return false;
  if (!ev.cabeEnVentana) return false;
  if (ev.paso.riesgoHelada === "alto") return false;
  if (!ctx.tieneRiego && ev.paso.deficitAguaMm > DEFICIT_AGUA_MAXIMO * ev.aguaMinimaMm) return false;
  return true;
}

export interface OpcionesBusqueda {
  /** Puntaje a maximizar (mayor es mejor). */
  puntuar: (s: SecuenciaEvaluada) => number;
  /** Si se indica, la secuencia debe contener este cultivo al menos una vez. */
  requerirClave?: string;
  /** Secuencias (claves unidas por ",") que no se pueden devolver. */
  excluirSecuencias?: readonly string[];
  /** true = no usa praderas perennes (rotación de cultivos de ciclo corto). */
  soloAnuales?: boolean;
}

function clavesUnidas(s: SecuenciaEvaluada): string {
  return s.claves.join(",");
}

/** true si el cultivo es viable (reglas duras de un solo semestre) en al menos un semestre sembrándolo de nuevo. */
export function esViableEnAlgunSemestre(cultivo: Cultivo, ctx: ContextoMotor): boolean {
  for (let s = 1; s <= SEMESTRES_ROTACION; s++) {
    if (pasoEsViable(cultivo, evaluarPaso(cultivo, s, false, ctx), ctx)) return true;
  }
  return false;
}

/** Mejor secuencia que cumple las reglas duras, o null si no existe ninguna. */
export function buscarMejorSecuencia(
  catalogo: readonly Cultivo[],
  ctx: ContextoMotor,
  prioridades: PrioridadesRotacion,
  opciones: OpcionesBusqueda,
): SecuenciaEvaluada | null {
  const ordenado = [...catalogo]
    .filter((c) => !(opciones.soloAnuales && c.perenne))
    .sort((a, b) => a.clave.localeCompare(b.clave));
  const cache = new Map<string, PasoEvaluado>();
  const paso = (c: Cultivo, semestre: number, continua: boolean): PasoEvaluado => {
    const k = c.clave + "|" + semestre + "|" + continua;
    let ev = cache.get(k);
    if (!ev) {
      ev = evaluarPaso(c, semestre, continua, ctx);
      cache.set(k, ev);
    }
    return ev;
  };

  let mejor: SecuenciaEvaluada | null = null;
  let mejorPuntaje = -Infinity;
  const actual: Cultivo[] = [];

  const recorrer = (semestre: number): void => {
    if (semestre > SEMESTRES_ROTACION) {
      if (!actual.some((c) => c.fijaNitrogeno)) return;
      if (opciones.requerirClave && !actual.some((c) => c.clave === opciones.requerirClave)) return;
      const clave = actual.map((c) => c.clave).join(",");
      if (opciones.excluirSecuencias?.includes(clave)) return;
      const evaluada = evaluarSecuencia([...actual], ctx, prioridades);
      const puntaje = Math.round(opciones.puntuar(evaluada) * 1e6);
      if (mejor === null || puntaje > mejorPuntaje) {
        mejor = evaluada;
        mejorPuntaje = puntaje;
      } else if (puntaje === mejorPuntaje) {
        // Desempate determinista: mayor puntajeTotal y luego orden alfabético de las claves.
        const gana = evaluada.puntajeTotal > mejor.puntajeTotal ||
          (evaluada.puntajeTotal === mejor.puntajeTotal && clavesUnidas(evaluada) < clavesUnidas(mejor));
        if (gana) mejor = evaluada;
      }
      return;
    }
    const previo = semestre > 1 ? actual[semestre - 2] : null;
    for (const c of ordenado) {
      const continua = continuaPradera(previo, c);
      if (previo && !continua && previo.compartenFamilia(c)) continue;
      if (!pasoEsViable(c, paso(c, semestre, continua), ctx)) continue;
      actual.push(c);
      recorrer(semestre + 1);
      actual.pop();
    }
  };
  recorrer(1);
  return mejor;
}
