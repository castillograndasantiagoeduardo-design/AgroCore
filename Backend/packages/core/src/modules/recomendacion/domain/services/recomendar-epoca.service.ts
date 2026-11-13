/**
 * Qué sembrar en cada época del año según el objetivo (servicio de dominio puro y determinista).
 *
 * Para cada época:
 *  1. Se evalúa sembrar cada cultivo del catálogo al inicio de la época (el motor elige el mejor mes dentro de ella;
 *     el ciclo puede seguir en los meses siguientes) con las mismas reglas duras del motor de rotaciones:
 *     temperatura (FAO ECOCROP), helada, calor, agua del ciclo (sin riego) y que el ciclo quepa en el año.
 *  2. Puntaje del objetivo = promedio ponderado (PESOS_OBJETIVO) de los puntajes 0–100 de agua, suelo, plagas,
 *     forraje e ingreso del cultivo (puntajesDeUnPaso). Un puntaje sin datos aporta 0 con su peso; "plagas" mide
 *     si rompe la familia del cultivo anterior (el actual del lote o el recomendado en la época anterior) y no
 *     cuenta si no hay cultivo anterior.
 *  3. PRESENCIA LOCAL (EVA en Colombia, FAOSTAT fuera): la primera recomendación sale de los cultivos que se siembran
 *     en la zona; un cultivo poco común solo puede ser la alternativa, con ADVERTENCIA_POCO_COMUN. En "Más ingreso"
 *     la primera recomendación debe ser local y tener dato de ingreso.
 *  4. Sin ningún cultivo viable (o en invierno sin cultivos que aguanten) → "descansar": con la cobertura viable de
 *     mejor puntaje de suelo, o en barbecho con rastrojo si no hay ninguna.
 */
import {
  ADVERTENCIA_POCO_COMUN,
  type DatoConFuente,
  type EpocaDto,
  type FuenteDato,
  NOMBRE_OBJETIVO,
  type Objetivo,
  OBJETIVOS,
  PESOS_OBJETIVO,
  type PerfilClimaticoDto,
  type RecomendacionEpocaDto,
  type RecomendacionesPorObjetivoDto,
  type VentanaRotacionDto,
} from "@agrocore/contracts";
import type { Cultivo } from "../../../cultivos/domain/entities/cultivo.entity.ts";
import { type ContextoMotor, evaluarPaso, type PasoEvaluado } from "../../../rotaciones/domain/services/evaluar-paso.service.ts";
import { pasoEsViable } from "../../../rotaciones/domain/services/generar-estrategias.service.ts";
import { puntajesDeUnPaso } from "../../../rotaciones/domain/services/puntajes-rotacion.service.ts";
import { calcularEscalaIngreso, type PresenciaMotor } from "../../../rotaciones/domain/services/presencia-motor.ts";
import { mesesDesde } from "../../../rotaciones/domain/services/ventanas-rotacion.service.ts";
import { NOMBRES_MES } from "../../../clima/domain/services/calendario-climatico.service.ts";

export interface EntradaRecomendacionEpocas {
  perfil: PerfilClimaticoDto;
  epocas: readonly EpocaDto[];
  catalogo: readonly Cultivo[];
  tieneRiego: boolean;
  cultivoActual: Cultivo | null;
  presencia: PresenciaMotor;
}

interface Candidato {
  cultivo: Cultivo;
  ev: PasoEvaluado;
  puntaje: number;
  presencia: "local" | "poco_comun" | "sin_datos";
  ingresoConDato: boolean;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const fmt = (v: number) => String(r1(v)).replace(".", ",");
const mes = (m: number) => NOMBRES_MES[m - 1].toLowerCase();

/** Contexto del motor para sembrar al inicio de `epoca`: la época como ventana y el resto del año como continuación. */
function contextoEpoca(e: EntradaRecomendacionEpocas, epoca: EpocaDto): ContextoMotor {
  const inicio = epoca.meses[0];
  const largo = epoca.meses.length;
  const ventanas: VentanaRotacionDto[] = [
    { indice: 1, tipo: "temporada", mesInicio: inicio, meses: [...epoca.meses], mesesTemporada: [...epoca.meses], nombre: epoca.nombre },
  ];
  if (largo < 12) {
    const resto = mesesDesde(((inicio - 1 + largo) % 12) + 1, 12 - largo);
    ventanas.push({ indice: 2, tipo: "intervalo", mesInicio: resto[0], meses: resto, mesesTemporada: [], nombre: "Resto del año" });
  }
  return {
    perfil: e.perfil,
    ventanas,
    tieneRiego: e.tieneRiego,
    suelo: { ph: null, textura: null },
    pendientePct: null,
    mesesBaldios: [],
    excluidoPct: 0,
    presencia: e.presencia,
    escalaIngreso: calcularEscalaIngreso(e.catalogo, e.presencia) ?? undefined,
  };
}

function puntuar(objetivo: Objetivo, p: ReturnType<typeof puntajesDeUnPaso>): number {
  const w = PESOS_OBJETIVO[objetivo];
  let suma = 0;
  let pesos = 0;
  for (const k of ["agua", "suelo", "plagas", "forraje", "ingreso"] as const) {
    if (k === "plagas" && p.plagas === null) continue; // sin cultivo anterior: no se mide
    suma += w[k] * (p[k] ?? 0);
    pesos += w[k];
  }
  return pesos ? suma / pesos : 0;
}

function datoPuntaje(valor: number, objetivo: Objetivo): DatoConFuente<number> {
  return {
    valor: Math.round(valor),
    unidad: "puntos de 100",
    fuente: "CALCULO",
    tipo: "calculado",
    nota: "Puntaje del objetivo " + NOMBRE_OBJETIVO[objetivo] + " (pesos fijos documentados en el módulo recomendacion)",
  };
}

function sugerido(c: Candidato, objetivo: Objetivo): RecomendacionEpocaDto["cultivo"] {
  const advertencia = c.presencia === "poco_comun"
    ? ADVERTENCIA_POCO_COMUN
    : c.presencia === "sin_datos" && !c.cultivo.esCobertura
    ? "Sin datos de presencia local de este cultivo: confirme que tiene comprador antes de sembrar"
    : undefined;
  return {
    clave: c.cultivo.clave,
    nombre: c.cultivo.nombre,
    presenciaLocal: c.presencia,
    ...(advertencia ? { advertencia } : {}),
    puntaje: datoPuntaje(c.puntaje, objetivo),
  };
}

/** Datos con fuente que respaldan la elección (los usa el texto "por qué"). */
function datosDe(c: Candidato, e: EntradaRecomendacionEpocas): DatoConFuente<number>[] {
  const p = c.ev.paso;
  const t = c.cultivo.fuenteDe("temperaturaOptimaC");
  const out: DatoConFuente<number>[] = [
    { valor: p.tempMediaCicloC, unidad: "°C", fuente: "NASA_POWER", tipo: "calculado", nota: "Temperatura media de los meses del ciclo" },
    { valor: p.lluviaCicloMm, unidad: "mm", fuente: "NASA_POWER", tipo: "calculado", nota: "Lluvia de los meses del ciclo" },
    { valor: c.cultivo.temperaturaOptimaC.min, unidad: "°C", fuente: "FAO_ECOCROP", tipo: "referencia", nota: t?.referencia },
    { valor: c.cultivo.temperaturaOptimaC.max, unidad: "°C", fuente: "FAO_ECOCROP", tipo: "referencia", nota: t?.referencia },
  ];
  const area = e.presencia.areaHa(c.cultivo.clave);
  if (area.valor !== null) out.push(area);
  return out;
}

function porQue(c: Candidato, e: EntradaRecomendacionEpocas): string {
  const p = c.ev.paso;
  const opt = c.cultivo.temperaturaOptimaC;
  let t = c.cultivo.nombre + " se siembra en " + mes(p.mesSiembra) + " y se cosecha hacia " + mes(p.mesCosecha) + ": la temperatura media del ciclo (" +
    fmt(p.tempMediaCicloC) + " °C) " + (p.aptitudClima === "optima" ? "está dentro de" : "está cerca de") + " su rango óptimo (" + fmt(opt.min) + "–" +
    fmt(opt.max) + " °C, FAO ECOCROP) y llueven " + fmt(p.lluviaCicloMm) + " mm en el ciclo";
  const area = e.presencia.areaHa(c.cultivo.clave);
  if (c.presencia === "local" && area.valor !== null) {
    t += "; se siembra en la zona (" + fmt(area.valor) + " ha al año según " + (area.fuente === "EVA" ? "EVA" : "FAOSTAT") + ")";
  }
  return t + ".";
}

function cuidado(c: Candidato, e: EntradaRecomendacionEpocas, anterior: Cultivo | null): string {
  const p = c.ev.paso;
  if (c.presencia === "poco_comun") return ADVERTENCIA_POCO_COMUN + ".";
  if (p.riesgoHelada === "moderado" || p.riesgoHelada === "tolerado") {
    return "Vigile las heladas de " + p.mesesHeladaEnCiclo.map(mes).join(", ") + ": el cultivo las aguanta solo en parte.";
  }
  if (p.riesgoCalor === "moderado" || p.riesgoCalor === "tolerado") return "Proteja el cultivo del calor de " + p.mesesCalorEnCiclo.map(mes).join(", ") + ".";
  if (p.deficitAguaMm > 0) {
    return e.tieneRiego
      ? "Faltan unos " + fmt(p.deficitAguaMm) + " mm de lluvia para lo óptimo: cúbralos con riego."
      : "La lluvia queda unos " + fmt(p.deficitAguaMm) + " mm por debajo de lo óptimo: siembre al comenzar las lluvias.";
  }
  if (p.aptitudClima === "posible") return "La temperatura está fuera del óptimo del cultivo: espere un rendimiento menor.";
  if (anterior && anterior.compartenFamilia(c.cultivo)) return "Es de la misma familia que el cultivo anterior: vigile plagas y enfermedades del suelo.";
  if (c.presencia === "sin_datos" && !c.cultivo.esCobertura) return "No hay datos de que se siembre en la zona: confirme que tiene comprador.";
  return "Haga un análisis de suelo antes de sembrar para ajustar la fertilización.";
}

function fuentesDe(c: Candidato): FuenteDato[] {
  const f = new Set<FuenteDato>(["NASA_POWER", "FAO_ECOCROP", "CALCULO"]);
  if (c.presencia !== "sin_datos") f.add(c.presencia === "local" || c.presencia === "poco_comun" ? "EVA" : "FAOSTAT");
  if (c.ingresoConDato) f.add("FAOSTAT");
  return [...f];
}

/** Evalúa y puntúa los cultivos viables de una época para un objetivo. */
function candidatos(e: EntradaRecomendacionEpocas, epoca: EpocaDto, objetivo: Objetivo, anterior: Cultivo | null): Candidato[] {
  const ctx = contextoEpoca(e, epoca);
  const out: Candidato[] = [];
  for (const c of e.catalogo) {
    if (c.perenne) continue; // las praderas perennes no se siembran "por época"
    const ev = evaluarPaso(c, 1, false, ctx);
    if (!pasoEsViable(ev, ctx)) continue;
    // La siembra tiene que caer dentro de la época.
    if (!epoca.meses.includes(ev.paso.mesSiembra)) continue;
    const p = puntajesDeUnPaso(ev, ctx);
    const plagas = anterior ? (anterior.compartenFamilia(c) ? 0 : 100) : null;
    const puntaje = puntuar(objetivo, { ...p, plagas });
    out.push({ cultivo: c, ev, puntaje, presencia: e.presencia.nivel(c.clave), ingresoConDato: p.ingreso !== null });
  }
  // Orden determinista: puntaje, luego clave.
  return out.sort((a, b) => b.puntaje - a.puntaje || a.cultivo.clave.localeCompare(b.cultivo.clave));
}

function elegir(objetivo: Objetivo, cands: Candidato[]): { primero: Candidato | null; alternativa: Candidato | null } {
  const sembrables = cands.filter((c) => !c.cultivo.esCobertura);
  const locales = sembrables.filter((c) => c.presencia === "local" && (objetivo !== "mas_ingreso" || c.ingresoConDato));
  const sinDatos = sembrables.filter((c) => c.presencia === "sin_datos");
  // Primera recomendación: local si hay; si la presencia no se conoce (fuente caída) se acepta sin_datos, salvo en "Más ingreso".
  const primero = locales[0] ?? (objetivo !== "mas_ingreso" ? sinDatos[0] ?? null : null);
  const resto = sembrables.filter((c) => c !== primero);
  const alternativa = resto[0] ?? null;
  return { primero, alternativa };
}

function descansar(e: EntradaRecomendacionEpocas, epoca: EpocaDto, objetivo: Objetivo): RecomendacionEpocaDto {
  const ctx = contextoEpoca(e, epoca);
  const coberturas = e.catalogo
    .filter((c) => c.esCobertura && !c.perenne)
    .map((c) => ({ c, ev: evaluarPaso(c, 1, false, ctx) }))
    .filter((x) => pasoEsViable(x.ev, ctx) && epoca.meses.includes(x.ev.paso.mesSiembra))
    .map((x) => ({ ...x, suelo: puntajesDeUnPaso(x.ev, ctx).suelo ?? 0 }))
    .sort((a, b) => b.suelo - a.suelo || a.c.clave.localeCompare(b.c.clave));
  const cob = coberturas[0];
  if (cob) {
    const cand: Candidato = { cultivo: cob.c, ev: cob.ev, puntaje: cob.suelo, presencia: e.presencia.nivel(cob.c.clave), ingresoConDato: false };
    return {
      epocaId: epoca.id,
      accion: "descansar",
      cultivo: sugerido(cand, objetivo),
      alternativa: null,
      queSembrar: "Dejar descansar con cobertura (" + cob.c.nombre.toLowerCase() + ")",
      porQue: "En esta época ningún cultivo comercial cumple temperatura, helada, calor y agua; " + porQue(cand, e).charAt(0).toLowerCase() +
        porQue(cand, e).slice(1),
      cuidado: "Incorpore la cobertura antes de la siguiente siembra para que aporte materia orgánica.",
      datos: datosDe(cand, e),
      fuentes: fuentesDe(cand),
    };
  }
  return {
    epocaId: epoca.id,
    accion: "descansar",
    cultivo: null,
    alternativa: null,
    queSembrar: "Dejar descansar (barbecho con rastrojo)",
    porQue: "En esta época ningún cultivo del catálogo cumple a la vez temperatura, helada, calor y agua: " + epoca.queOcurre.charAt(0).toLowerCase() +
      epoca.queOcurre.slice(1),
    cuidado: "Deje el rastrojo en la superficie para proteger el suelo.",
    datos: [epoca.datos.tempMediaC, epoca.datos.lluviaMm],
    fuentes: ["NASA_POWER", "FAO_ECOCROP"],
  };
}

/** Recomendación por época para UN objetivo (recorre las épocas en orden y rota familias). */
export function recomendarParaObjetivo(e: EntradaRecomendacionEpocas, objetivo: Objetivo): RecomendacionEpocaDto[] {
  let anterior = e.cultivoActual;
  return e.epocas.map((epoca) => {
    const { primero, alternativa } = elegir(objetivo, candidatos(e, epoca, objetivo, anterior));
    if (!primero) {
      const d = descansar(e, epoca, objetivo);
      if (alternativa) d.alternativa = sugerido(alternativa, objetivo);
      return d;
    }
    const ant = anterior;
    anterior = primero.cultivo;
    return {
      epocaId: epoca.id,
      accion: "sembrar",
      cultivo: sugerido(primero, objetivo),
      alternativa: alternativa ? sugerido(alternativa, objetivo) : null,
      queSembrar: "Sembrar " + primero.cultivo.nombre.toLowerCase(),
      porQue: porQue(primero, e),
      cuidado: cuidado(primero, e, ant),
      datos: datosDe(primero, e),
      fuentes: fuentesDe(primero),
    };
  });
}

/** Los 4 objetivos a la vez: cambiar de objetivo en la interfaz es instantáneo (sin otra petición). */
export function recomendarPorEpoca(e: EntradaRecomendacionEpocas): RecomendacionesPorObjetivoDto {
  return Object.fromEntries(OBJETIVOS.map((o) => [o, recomendarParaObjetivo(e, o)])) as RecomendacionesPorObjetivoDto;
}
