/**
 * Búsqueda de rotaciones (servicio de dominio puro y determinista).
 *
 * 1. Para cada paso (2 años × ventanas del sitio) se evalúan TODOS los cultivos del catálogo y se descartan
 *    los que violan las reglas DURAS de un solo paso: temperatura no apta, ciclo que no cabe, helada o calor
 *    "alto" y déficit de agua > 30 % del mínimo sin riego. En un intervalo (invierno / estación seca) también
 *    se ofrece el barbecho.
 * 2. Se conservan los MAX_CANDIDATOS mejores de cada paso según la heurística del enfoque (poda: con 51
 *    cultivos y 4 pasos la búsqueda exhaustiva serían 6,7 millones de secuencias).
 * 3. Recorrido en profundidad: no repetir familia entre cultivos sembrados seguidos (el barbecho no rompe la
 *    cadena), continuar praderas y cultivos largos, al menos una leguminosa y secuencias no excluidas.
 * 4. Gana la de mayor puntaje según la función del enfoque; desempate por puntajeTotal y orden alfabético.
 */
import type { PrioridadesRotacion, PuntajesRotacionDto, EvaluacionReglaDto, PasoRotacionDto } from "@agrocore/contracts";
import { CLAVE_BARBECHO } from "@agrocore/contracts";
import type { Cultivo } from "../../../cultivos/domain/entities/cultivo.entity.ts";
import { type ContextoMotor, type ElementoSecuencia, evaluarPaso, type PasoEvaluado, totalPasos, ventanaDe } from "./evaluar-paso.service.ts";
import { calcularPuntajes, calcularPuntajeTotal } from "./puntajes-rotacion.service.ts";
import { evaluarReglas } from "./reglas-rotacion.service.ts";

/** Déficit de agua tolerado (fracción del mínimo del cultivo) cuando el lote no tiene riego. */
export const DEFICIT_AGUA_MAXIMO = 0.3;
/** Cultivos que se conservan por paso tras la poda. */
export const MAX_CANDIDATOS = 9;

export interface SecuenciaEvaluada {
  elementos: ElementoSecuencia[];
  /** Claves por paso ("barbecho" para el descanso). */
  claves: string[];
  evaluados: PasoEvaluado[];
  pasos: PasoRotacionDto[];
  reglas: EvaluacionReglaDto[];
  puntajes: PuntajesRotacionDto;
  puntajeTotal: number;
}

export const claveSecuencia = (claves: readonly string[]): string => claves.join(",");

/** Evalúa pasos, reglas y puntajes de una secuencia completa. */
export function evaluarSecuencia(elementos: ElementoSecuencia[], ctx: ContextoMotor, prioridades: PrioridadesRotacion): SecuenciaEvaluada {
  const evaluados = elementos.map((el, i) => evaluarPaso(el.cultivo, i + 1, el.continua, ctx));
  const puntajes = calcularPuntajes(evaluados, ctx.tieneRiego);
  return {
    elementos,
    claves: elementos.map((e) => e.cultivo?.clave ?? CLAVE_BARBECHO),
    evaluados,
    pasos: evaluados.map((e) => e.paso),
    reglas: evaluarReglas(evaluados, ctx),
    puntajes,
    puntajeTotal: calcularPuntajeTotal(puntajes, prioridades),
  };
}

/** Un paso es viable si cumple las reglas duras que dependen de ese solo paso. */
export function pasoEsViable(ev: PasoEvaluado, ctx: ContextoMotor): boolean {
  if (ev.cultivo === null) return ev.paso.tipoVentana === "intervalo";
  if (ev.paso.aptitudClima === "no_apta") return false;
  if (!ev.cabe) return false;
  if (ev.paso.riesgoHelada === "alto" || ev.paso.riesgoCalor === "alto") return false;
  if (!ctx.tieneRiego && ev.paso.deficitAguaMm > DEFICIT_AGUA_MAXIMO * ev.aguaMinimaMm) return false;
  return true;
}

/** true si el cultivo es viable sembrándolo en alguna de las ventanas. */
export function esViableEnAlgunaVentana(cultivo: Cultivo, ctx: ContextoMotor): boolean {
  for (let orden = 1; orden <= totalPasos(ctx); orden++) {
    if (pasoEsViable(evaluarPaso(cultivo, orden, false, ctx), ctx)) return true;
  }
  return false;
}

export interface OpcionesBusqueda {
  /** Puntaje a maximizar (mayor es mejor). */
  puntuar: (s: SecuenciaEvaluada) => number;
  /** Puntaje rápido de UN cultivo para podar candidatos (mayor es mejor). */
  heuristica: (c: Cultivo, ev: PasoEvaluado) => number;
  /** Si se indica, la secuencia debe contener este cultivo al menos una vez. */
  requerirClave?: string;
  /** Secuencias (claves unidas por ",") que no se pueden devolver. */
  excluirSecuencias?: readonly string[];
  /** true = no usa praderas perennes. */
  soloAnuales?: boolean;
}

interface Candidato {
  cultivo: Cultivo | null;
  ev: PasoEvaluado;
}

/** Mejor secuencia que cumple las reglas duras, o null si no existe ninguna. */
export function buscarMejorSecuencia(
  catalogo: readonly Cultivo[],
  ctx: ContextoMotor,
  prioridades: PrioridadesRotacion,
  opciones: OpcionesBusqueda,
): SecuenciaEvaluada | null {
  const n = totalPasos(ctx);
  const usables = [...catalogo].filter((c) => !(opciones.soloAnuales && c.perenne)).sort((a, b) => a.clave.localeCompare(b.clave));

  // 1–2. Candidatos viables por paso, podados por la heurística del enfoque.
  const candidatos: Candidato[][] = [];
  for (let orden = 1; orden <= n; orden++) {
    const viables: Candidato[] = [];
    for (const c of usables) {
      const ev = evaluarPaso(c, orden, false, ctx);
      if (pasoEsViable(ev, ctx)) viables.push({ cultivo: c, ev });
    }
    viables.sort((a, b) => opciones.heuristica(b.cultivo!, b.ev) - opciones.heuristica(a.cultivo!, a.ev) || a.cultivo!.clave.localeCompare(b.cultivo!.clave));
    let elegidos = viables.slice(0, MAX_CANDIDATOS);
    // Garantizar una leguminosa y el cultivo requerido entre los candidatos si son viables aquí.
    const extra = viables.filter((x) =>
      !elegidos.includes(x) && ((x.cultivo!.fijaNitrogeno && !elegidos.some((y) => y.cultivo!.fijaNitrogeno)) || x.cultivo!.clave === opciones.requerirClave)
    );
    elegidos = [...elegidos, ...extra.slice(0, 2)];
    if (ventanaDe(orden, ctx).tipo === "intervalo") {
      const barbecho = evaluarPaso(null, orden, false, ctx);
      elegidos.push({ cultivo: null, ev: barbecho });
    }
    candidatos.push(elegidos);
  }

  let mejor: SecuenciaEvaluada | null = null;
  let mejorPuntaje = -Infinity;
  const actual: ElementoSecuencia[] = [];
  const cacheContinuacion = new Map<string, PasoEvaluado>();
  const continuacion = (c: Cultivo, orden: number): PasoEvaluado => {
    const k = c.clave + "|" + orden;
    let ev = cacheContinuacion.get(k);
    if (!ev) {
      ev = evaluarPaso(c, orden, true, ctx);
      cacheContinuacion.set(k, ev);
    }
    return ev;
  };
  /** Último cultivo SEMBRADO (no barbecho) antes del paso actual. */
  const ultimoCultivo = (): Cultivo | null => {
    for (let i = actual.length - 1; i >= 0; i--) if (actual[i].cultivo) return actual[i].cultivo;
    return null;
  };

  const recorrer = (orden: number, forzado: Cultivo | null): void => {
    if (orden > n) {
      const cultivos = actual.map((e) => e.cultivo).filter((c): c is Cultivo => c !== null);
      if (!cultivos.some((c) => c.fijaNitrogeno)) return;
      if (opciones.requerirClave && !cultivos.some((c) => c.clave === opciones.requerirClave)) return;
      const claves = actual.map((e) => e.cultivo?.clave ?? CLAVE_BARBECHO);
      if (opciones.excluirSecuencias?.includes(claveSecuencia(claves))) return;
      const evaluada = evaluarSecuencia(actual.map((e) => ({ ...e })), ctx, prioridades);
      const puntaje = Math.round(opciones.puntuar(evaluada) * 1e6);
      if (mejor === null || puntaje > mejorPuntaje) {
        mejor = evaluada;
        mejorPuntaje = puntaje;
      } else if (puntaje === mejorPuntaje) {
        const gana = evaluada.puntajeTotal > mejor.puntajeTotal ||
          (evaluada.puntajeTotal === mejor.puntajeTotal && claveSecuencia(evaluada.claves) < claveSecuencia(mejor.claves));
        if (gana) mejor = evaluada;
      }
      return;
    }

    // Un cultivo largo sembrado en el paso anterior ocupa obligatoriamente este paso.
    if (forzado) {
      actual.push({ cultivo: forzado, continua: true });
      recorrer(orden + 1, null);
      actual.pop();
      return;
    }

    const previo = actual.length ? actual[actual.length - 1] : null;
    // Continuar una pradera perenne.
    if (previo?.cultivo?.perenne) {
      const ev = continuacion(previo.cultivo, orden);
      if (ev.paso.riesgoHelada !== "alto" && ev.paso.riesgoCalor !== "alto") {
        actual.push({ cultivo: previo.cultivo, continua: true });
        recorrer(orden + 1, null);
        actual.pop();
      }
    }

    const anterior = ultimoCultivo();
    for (const cand of candidatos[orden - 1]) {
      if (cand.cultivo && anterior && anterior.compartenFamilia(cand.cultivo)) continue;
      if (cand.ev.necesitaSiguiente && orden === n) continue;
      actual.push({ cultivo: cand.cultivo, continua: false });
      recorrer(orden + 1, cand.ev.necesitaSiguiente ? cand.cultivo : null);
      actual.pop();
    }
  };
  recorrer(1, null);
  return mejor;
}
