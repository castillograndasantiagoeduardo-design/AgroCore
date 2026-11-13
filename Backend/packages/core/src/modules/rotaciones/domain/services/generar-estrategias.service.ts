/**
 * Búsqueda EXACTA de rotaciones (servicio de dominio puro y determinista).
 *
 * 1. Para cada paso (2 años × ventanas del sitio) se evalúan TODOS los cultivos del catálogo y se descartan
 *    los que violan las reglas DURAS de un solo paso: temperatura no apta, ciclo que no cabe, helada o calor
 *    "alto", déficit de agua > 30 % del mínimo sin riego y campos de viabilidad sin fuente. En un intervalo
 *    (invierno / estación seca) también se ofrece el barbecho. No hay poda heurística: el prefiltro es solo
 *    de época (viabilidad).
 * 2. Recorrido en profundidad con RAMIFICACIÓN Y ACOTAMIENTO: no repetir familia entre cultivos sembrados
 *    seguidos (el barbecho no rompe la cadena), continuar praderas y cultivos largos, al menos una leguminosa y
 *    secuencias no excluidas. En cada nodo se calcula una cota superior ADMISIBLE del puntaje del enfoque
 *    (parcial + máximo posible de los pasos restantes por puntaje; plagas solo puede bajar al agregar pasos;
 *    bono de aptitud ≤ máximo posible; penalizaciones ≥ su mínimo seguro) y se poda si no puede superar a la
 *    mejor secuencia hallada. Los candidatos se exploran por la heurística del enfoque para hallar pronto buenas
 *    soluciones.
 * 3. Gana la de mayor puntaje según la función del enfoque (redondeado a 1e-6); desempate por puntajeTotal y
 *    orden alfabético de la secuencia. El resultado es IDÉNTICO al del recorrido exhaustivo
 *    (`buscarMejorSecuenciaExhaustiva`, sin cota), que existe solo para verificarlo en los tests.
 */
import type { EvaluacionReglaDto, PasoRotacionDto, PrioridadesRotacion, PuntajesRotacionDto } from "@agrocore/contracts";
import { CLAVE_BARBECHO } from "@agrocore/contracts";
import type { Cultivo } from "../../../cultivos/domain/entities/cultivo.entity.ts";
import { type ContextoMotor, type ElementoSecuencia, evaluarPaso, type PasoEvaluado, totalPasos, ventanaDe } from "./evaluar-paso.service.ts";
import { calcularPuntajes, calcularPuntajeTotal, type ComponentesPaso, componentesPaso, puntajePlagas } from "./puntajes-rotacion.service.ts";
import { evaluarReglas, pasoSueloIncompatible, pasosSembrados } from "./reglas-rotacion.service.ts";

/** Déficit de agua tolerado (fracción del mínimo del cultivo) cuando el lote no tiene riego. */
export const DEFICIT_AGUA_MAXIMO = 0.3;

/** Tolerancia numérica al comparar la cota con el mejor puntaje (errores de coma flotante). */
const EPSILON_COTA = 1e-6;
/** Tolerancia para no perder un redondeo por errores de coma flotante al acotar los promedios. */
const EPSILON_REDONDEO = 1e-9;

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

function evaluarConPasos(
  elementos: ElementoSecuencia[],
  evaluados: PasoEvaluado[],
  ctx: ContextoMotor,
  prioridades: PrioridadesRotacion,
): SecuenciaEvaluada {
  const puntajes = calcularPuntajes(evaluados, ctx);
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

/** Evalúa pasos, reglas y puntajes de una secuencia completa. */
export function evaluarSecuencia(elementos: ElementoSecuencia[], ctx: ContextoMotor, prioridades: PrioridadesRotacion): SecuenciaEvaluada {
  const evaluados = elementos.map((el, i) => evaluarPaso(el.cultivo, i + 1, el.continua, ctx));
  return evaluarConPasos(elementos, evaluados, ctx, prioridades);
}

/** Un paso es viable si cumple las reglas duras que dependen de ese solo paso. */
export function pasoEsViable(ev: PasoEvaluado, ctx: ContextoMotor): boolean {
  if (ev.cultivo === null) return ev.paso.tipoVentana === "intervalo";
  if (ev.cultivo.sinDatosDeViabilidad) return false;
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

/**
 * Lo que la búsqueda sabe en un nodo parcial para acotar el puntaje de CUALQUIER secuencia completa que lo extienda.
 * Todos los puntajes ya vienen redondeados como los redondea `calcularPuntajes` (el redondeo es monótono).
 */
export interface CotaParcial {
  /** Cota superior de cada puntaje de la secuencia completa. */
  puntajes: PuntajesRotacionDto;
  /** Cota superior del puntaje total ponderado. */
  total: number;
  /** Cota superior de la fracción de pasos con aptitud de temperatura óptima (0–1). */
  fraccionOptimaMax: number;
  /** true si ya hay un cultivo sembrado incompatible con el suelo (la penalización de suelo es segura). */
  sueloIncompatibleSeguro: boolean;
  /** Cota inferior de la fracción de pasos sembrados con presencia "poco_comun" (0–1). */
  fraccionPocoComunMin: number;
}

export interface OpcionesBusqueda {
  /** Puntaje a maximizar (mayor es mejor). */
  puntuar: (s: SecuenciaEvaluada) => number;
  /** Puntaje rápido de UN cultivo en UN paso para ordenar la exploración (mayor es mejor). */
  heuristica: (c: Cultivo, ev: PasoEvaluado, ctx: ContextoMotor) => number;
  /**
   * Cota superior ADMISIBLE de `puntuar` para toda secuencia que extienda el nodo parcial. Si no se indica,
   * no hay poda (recorrido completo).
   */
  cota?: (c: CotaParcial) => number;
  /** Si se indica, la secuencia debe contener este cultivo al menos una vez. */
  requerirClave?: string;
  /** Secuencias (claves unidas por ",") que no se pueden devolver. */
  excluirSecuencias?: readonly string[];
  /** true = no usa praderas perennes. */
  soloAnuales?: boolean;
  /** true = el primer cultivo SEMBRADO no puede tener presencia "poco_comun". */
  evitarPocoComunPrimero?: boolean;
}

interface Candidato {
  cultivo: Cultivo | null;
  ev: PasoEvaluado;
}

const SIN_COMPONENTES: ComponentesPaso = { agua: 0, suelo: 0, forraje: 0, ingreso: 0 };

function buscar(
  catalogo: readonly Cultivo[],
  ctx: ContextoMotor,
  prioridades: PrioridadesRotacion,
  opciones: OpcionesBusqueda,
  podar: boolean,
): SecuenciaEvaluada | null {
  const n = totalPasos(ctx);
  const usables = [...catalogo].filter((c) => !(opciones.soloAnuales && c.perenne)).sort((a, b) => a.clave.localeCompare(b.clave));

  // Evaluaciones de pasos con caché: un (cultivo, orden, continua) se evalúa una sola vez.
  const cache = new Map<string, PasoEvaluado>();
  const evaluar = (c: Cultivo | null, orden: number, continua: boolean): PasoEvaluado => {
    const k = (c?.clave ?? CLAVE_BARBECHO) + "|" + orden + "|" + continua;
    let ev = cache.get(k);
    if (!ev) {
      ev = evaluarPaso(c, orden, continua, ctx);
      cache.set(k, ev);
    }
    return ev;
  };

  // 1. Candidatos viables por paso (prefiltro de época), ordenados por la heurística del enfoque.
  const candidatos: Candidato[][] = [];
  for (let orden = 1; orden <= n; orden++) {
    const viables: Candidato[] = [];
    for (const c of usables) {
      const ev = evaluar(c, orden, false);
      if (pasoEsViable(ev, ctx)) viables.push({ cultivo: c, ev });
    }
    viables.sort((a, b) => opciones.heuristica(b.cultivo!, b.ev, ctx) - opciones.heuristica(a.cultivo!, a.ev, ctx) || a.cultivo!.clave.localeCompare(b.cultivo!.clave));
    if (ventanaDe(orden, ctx).tipo === "intervalo") viables.push({ cultivo: null, ev: evaluar(null, orden, false) });
    candidatos.push(viables);
  }

  // 2. Máximos por posición de cada puntaje por paso (solo con poda): candidatos, continuaciones posibles y barbecho.
  const restoMax: ComponentesPaso[] = [];
  const hayLegumbreDesde: boolean[] = [];
  const hayRequeridoDesde: boolean[] = [];
  if (podar) {
    const maxPos: ComponentesPaso[] = [];
    for (let orden = 1; orden <= n; orden++) {
      const evs: PasoEvaluado[] = candidatos[orden - 1].map((c) => c.ev);
      // Continuaciones posibles en este paso: perennes sembradas antes y cultivos largos sembrados en el paso anterior.
      for (let i = 1; i < orden; i++) {
        for (const cand of candidatos[i - 1]) {
          if (cand.cultivo && (cand.cultivo.perenne || (i === orden - 1 && cand.ev.necesitaSiguiente))) evs.push(evaluar(cand.cultivo, orden, true));
        }
      }
      const m: ComponentesPaso = { agua: 0, suelo: 0, forraje: 0, ingreso: 0 };
      for (const ev of evs) {
        const c = componentesPaso(ev, ctx);
        m.agua = Math.max(m.agua, c.agua);
        m.suelo = Math.max(m.suelo, c.suelo);
        m.forraje = Math.max(m.forraje, c.forraje);
        m.ingreso = Math.max(m.ingreso ?? 0, c.ingreso ?? 0);
      }
      maxPos.push(m);
    }
    for (let orden = 1; orden <= n + 1; orden++) {
      const s: ComponentesPaso = { agua: 0, suelo: 0, forraje: 0, ingreso: 0 };
      for (let j = orden; j <= n; j++) {
        s.agua += maxPos[j - 1].agua;
        s.suelo += maxPos[j - 1].suelo;
        s.forraje += maxPos[j - 1].forraje;
        s.ingreso! += maxPos[j - 1].ingreso ?? 0;
      }
      restoMax[orden] = s;
      const resto = candidatos.slice(orden - 1).flat();
      hayLegumbreDesde[orden] = resto.some((c) => c.cultivo?.fijaNitrogeno === true);
      hayRequeridoDesde[orden] = opciones.requerirClave !== undefined && resto.some((c) => c.cultivo?.clave === opciones.requerirClave);
    }
  }

  let mejor: SecuenciaEvaluada | null = null;
  let mejorPuntaje = -Infinity;
  const actual: ElementoSecuencia[] = [];
  const evsActuales: PasoEvaluado[] = [];
  const compsActuales: ComponentesPaso[] = [];

  const apilar = (el: ElementoSecuencia, ev: PasoEvaluado): void => {
    actual.push(el);
    evsActuales.push(ev);
    compsActuales.push(podar ? componentesPaso(ev, ctx) : SIN_COMPONENTES);
  };
  const desapilar = (): void => {
    actual.pop();
    evsActuales.pop();
    compsActuales.pop();
  };

  /** Último cultivo SEMBRADO (no barbecho) antes del paso actual. */
  const ultimoCultivo = (): Cultivo | null => {
    for (let i = actual.length - 1; i >= 0; i--) if (actual[i].cultivo) return actual[i].cultivo;
    return null;
  };

  /** Cota superior del puntaje de cualquier secuencia completa que extienda `actual` (siguiente paso: `orden`). */
  const cotaNodo = (orden: number): number => {
    const fijos = actual.length;
    const r = n - fijos;
    let sa = 0, ss = 0, sf = 0, si = 0;
    for (const c of compsActuales) {
      sa += c.agua;
      ss += c.suelo;
      sf += c.forraje;
      si += c.ingreso ?? 0;
    }
    const resto = restoMax[orden];
    const puntajes: PuntajesRotacionDto = {
      agua: Math.round((sa + resto.agua) / n + EPSILON_REDONDEO),
      suelo: Math.round((ss + resto.suelo) / n + EPSILON_REDONDEO),
      plagas: Math.round(puntajePlagas(evsActuales)),
      forraje: Math.round((sf + resto.forraje) / n + EPSILON_REDONDEO),
      ingreso: Math.round((si + (resto.ingreso ?? 0)) / n + EPSILON_REDONDEO),
    };
    let optimos = 0, conCultivo = 0, sembrados = 0, pocoComun = 0, incompatible = false;
    for (const ev of evsActuales) {
      if (ev.paso.aptitudClima !== null) {
        conCultivo++;
        if (ev.paso.aptitudClima === "optima") optimos++;
      }
      if (ev.cultivo !== null && !ev.paso.continua) {
        sembrados++;
        if (ev.presencia === "poco_comun") pocoComun++;
      }
      if (!incompatible && ev.cultivo !== null && !ev.paso.continua && pasoSueloIncompatible(ev, ctx)) incompatible = true;
    }
    return opciones.cota!({
      puntajes,
      total: calcularPuntajeTotal(puntajes, prioridades),
      fraccionOptimaMax: conCultivo + r > 0 ? (optimos + r) / (conCultivo + r) : 0,
      sueloIncompatibleSeguro: incompatible,
      fraccionPocoComunMin: sembrados + r > 0 ? pocoComun / (sembrados + r) : 0,
    });
  };

  const recorrer = (orden: number, forzado: Cultivo | null): void => {
    if (orden > n) {
      const cultivos = actual.map((e) => e.cultivo).filter((c): c is Cultivo => c !== null);
      if (!cultivos.some((c) => c.fijaNitrogeno)) return;
      if (opciones.requerirClave && !cultivos.some((c) => c.clave === opciones.requerirClave)) return;
      const claves = actual.map((e) => e.cultivo?.clave ?? CLAVE_BARBECHO);
      if (opciones.excluirSecuencias?.includes(claveSecuencia(claves))) return;
      const evaluada = evaluarConPasos(actual.map((e) => ({ ...e })), [...evsActuales], ctx, prioridades);
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

    if (podar) {
      // Factibilidad: aún debe poder aparecer una leguminosa y el cultivo requerido.
      if (!actual.some((e) => e.cultivo?.fijaNitrogeno) && !hayLegumbreDesde[orden]) return;
      if (opciones.requerirClave && !actual.some((e) => e.cultivo?.clave === opciones.requerirClave) && !hayRequeridoDesde[orden]) return;
      // Cota: si no puede alcanzar a la mejor (ni empatarla), se descarta toda la rama.
      if (mejor !== null && opciones.cota && Math.round((cotaNodo(orden) + EPSILON_COTA) * 1e6) < mejorPuntaje) return;
    }

    // Un cultivo largo sembrado en el paso anterior ocupa obligatoriamente este paso.
    if (forzado) {
      apilar({ cultivo: forzado, continua: true }, evaluar(forzado, orden, true));
      recorrer(orden + 1, null);
      desapilar();
      return;
    }

    const previo = actual.length ? actual[actual.length - 1] : null;
    // Continuar una pradera perenne.
    if (previo?.cultivo?.perenne) {
      const ev = evaluar(previo.cultivo, orden, true);
      if (ev.paso.riesgoHelada !== "alto" && ev.paso.riesgoCalor !== "alto") {
        apilar({ cultivo: previo.cultivo, continua: true }, ev);
        recorrer(orden + 1, null);
        desapilar();
      }
    }

    const anterior = ultimoCultivo();
    for (const cand of candidatos[orden - 1]) {
      if (cand.cultivo && anterior && anterior.compartenFamilia(cand.cultivo)) continue;
      if (cand.ev.necesitaSiguiente && orden === n) continue;
      if (opciones.evitarPocoComunPrimero && cand.cultivo && cand.ev.presencia === "poco_comun" && !actual.some((e) => e.cultivo)) continue;
      apilar({ cultivo: cand.cultivo, continua: false }, cand.ev);
      recorrer(orden + 1, cand.ev.necesitaSiguiente ? cand.cultivo : null);
      desapilar();
    }
  };
  recorrer(1, null);
  return mejor;
}

/** Mejor secuencia que cumple las reglas duras (búsqueda exacta con ramificación y acotamiento), o null si no existe ninguna. */
export function buscarMejorSecuencia(
  catalogo: readonly Cultivo[],
  ctx: ContextoMotor,
  prioridades: PrioridadesRotacion,
  opciones: OpcionesBusqueda,
): SecuenciaEvaluada | null {
  return buscar(catalogo, ctx, prioridades, opciones, true);
}

/**
 * Recorrido completo SIN poda ni cota, con la misma semántica que `buscarMejorSecuencia`. Es lento: existe solo
 * para comprobar en los tests que la búsqueda acotada devuelve exactamente lo mismo.
 */
export function buscarMejorSecuenciaExhaustiva(
  catalogo: readonly Cultivo[],
  ctx: ContextoMotor,
  prioridades: PrioridadesRotacion,
  opciones: OpcionesBusqueda,
): SecuenciaEvaluada | null {
  return buscar(catalogo, ctx, prioridades, opciones, false);
}
