/**
 * Enfoques de las estrategias B (suelo), C (forraje / ingreso) y D (agua): función de puntuación que maximiza la
 * búsqueda, su cota superior admisible y la heurística que ordena la exploración (servicio de dominio puro).
 *
 * Puntaje de un enfoque = Σ peso_k × puntaje_k + peso_total × puntajeTotal + bono de aptitud óptima
 *                         − penalización de suelo − penalización por cultivos poco comunes.
 *
 *   bono de aptitud    0–25 puntos × fracción de pasos con temperatura ÓPTIMA (un cultivo solo "posible" rinde menos).
 *   suelo incompatible −6 si el pH o la textura del suelo no encajan con algún cultivo sembrado (solo con datos de suelo).
 *   poco común         −20 × fracción de pasos SEMBRADOS con presencia local "poco_comun" (criterio del sistema:
 *                      no se recomienda lo que casi nadie siembra en la zona sin avisar).
 */
import type { EnfoqueEstrategia, IdEstrategia, PrioridadRotacion } from "@agrocore/contracts";
import type { ContextoMotor, PasoEvaluado } from "./evaluar-paso.service.ts";
import type { CotaParcial, OpcionesBusqueda, SecuenciaEvaluada } from "./generar-estrategias.service.ts";
import { componentesPaso, PUNTAJE_COBERTURA, PUNTAJE_FORRAJE } from "./puntajes-rotacion.service.ts";
import { pasosSembrados } from "./reglas-rotacion.service.ts";
import type { Cultivo } from "../../../cultivos/domain/entities/cultivo.entity.ts";

/** Premio máximo (0–25 puntos) por la fracción de pasos con temperatura ÓPTIMA. */
export const BONO_APTITUD_OPTIMA = 25;
/** Penalización por pH o textura incompatibles. */
export const PENALIZACION_SUELO_INCOMPATIBLE = 6;
/** Penalización máxima (todos los cultivos sembrados poco comunes) por presencia local "poco_comun". */
export const PENALIZACION_POCO_COMUN = 20;

const NIVEL = { baja: 0, media: 1, alta: 2 } as const;
const AGUA = { baja: 100, media: 60, alta: 25 } as const;

export function bonoAptitud(s: SecuenciaEvaluada): number {
  const conCultivo = s.pasos.filter((p) => p.aptitudClima !== null);
  return conCultivo.length ? (conCultivo.filter((p) => p.aptitudClima === "optima").length / conCultivo.length) * BONO_APTITUD_OPTIMA : 0;
}

/** Penaliza pH o textura incompatibles (solo si se conoce el suelo). */
export function penalizacionSuelo(s: SecuenciaEvaluada): number {
  return s.reglas.find((r) => r.regla === "suelo_compatible")?.cumple === false ? PENALIZACION_SUELO_INCOMPATIBLE : 0;
}

/** −20 × fracción de pasos sembrados con presencia "poco_comun". */
export function penalizacionPocoComun(s: SecuenciaEvaluada): number {
  const sembrados = pasosSembrados(s.evaluados);
  if (sembrados.length === 0) return 0;
  return PENALIZACION_POCO_COMUN * (sembrados.filter((e) => e.presencia === "poco_comun").length / sembrados.length);
}

type PesosEnfoque = { [k in PrioridadRotacion]?: number } & { total: number };

const PESOS: Record<Exclude<IdEstrategia, "A">, PesosEnfoque> = {
  B: { suelo: 0.5, plagas: 0.3, total: 0.2 },
  C: { forraje: 0.4, ingreso: 0.3, total: 0.3 },
  D: { agua: 0.6, suelo: 0.2, total: 0.2 },
};

const CLAVES_PUNTAJE = ["agua", "suelo", "plagas", "forraje", "ingreso"] as const;

function puntuarCon(w: PesosEnfoque): OpcionesBusqueda["puntuar"] {
  return (s) =>
    CLAVES_PUNTAJE.reduce((acc, k) => acc + (w[k] ?? 0) * s.puntajes[k], 0) + w.total * s.puntajeTotal +
    bonoAptitud(s) - penalizacionSuelo(s) - penalizacionPocoComun(s);
}

function cotaCon(w: PesosEnfoque): NonNullable<OpcionesBusqueda["cota"]> {
  return (c: CotaParcial) =>
    CLAVES_PUNTAJE.reduce((acc, k) => acc + (w[k] ?? 0) * c.puntajes[k], 0) + w.total * c.total + BONO_APTITUD_OPTIMA * c.fraccionOptimaMax -
    (c.sueloIncompatibleSeguro ? PENALIZACION_SUELO_INCOMPATIBLE : 0) - PENALIZACION_POCO_COMUN * c.fraccionPocoComunMin;
}

/** Base común de la heurística: premia la temperatura óptima, resta la helada moderada y los cultivos poco comunes. */
const heuristicaBase = (ev: PasoEvaluado) =>
  (ev.paso.aptitudClima === "optima" ? 30 : 0) - (ev.paso.riesgoHelada === "moderado" ? 5 : 0) -
  (ev.presencia === "poco_comun" ? PENALIZACION_POCO_COMUN : 0);

export const ENFOQUES_ROTACION: Record<
  Exclude<IdEstrategia, "A">,
  { enfoque: EnfoqueEstrategia; opciones: Pick<OpcionesBusqueda, "puntuar" | "heuristica" | "cota"> }
> = {
  B: {
    enfoque: "suelo",
    opciones: {
      puntuar: puntuarCon(PESOS.B),
      cota: cotaCon(PESOS.B),
      heuristica: (c: Cultivo, ev: PasoEvaluado) => {
        const cobertura = c.coberturaConocida();
        return 0.5 * (cobertura ? PUNTAJE_COBERTURA[cobertura] : 0) + 30 * Number(c.fijaNitrogeno) +
          10 * NIVEL[c.profundidadRaiz === "profunda" ? "alta" : "baja"] + heuristicaBase(ev);
      },
    },
  },
  C: {
    enfoque: "forraje",
    opciones: {
      puntuar: puntuarCon(PESOS.C),
      cota: cotaCon(PESOS.C),
      heuristica: (c: Cultivo, ev: PasoEvaluado, ctx: ContextoMotor) => {
        const forraje = c.valorForrajeroConocido();
        return 0.5 * (forraje ? PUNTAJE_FORRAJE[forraje] : 0) + 0.4 * (componentesPaso(ev, ctx).ingreso ?? 0) + 10 * Number(c.fijaNitrogeno) +
          heuristicaBase(ev);
      },
    },
  },
  D: {
    enfoque: "agua",
    opciones: {
      puntuar: puntuarCon(PESOS.D),
      cota: cotaCon(PESOS.D),
      heuristica: (c: Cultivo, ev: PasoEvaluado) =>
        0.6 * AGUA[c.necesidadAgua] + 15 * NIVEL[c.toleranciaSequia] + 10 * Number(c.fijaNitrogeno) - ev.paso.deficitAguaMm / 10 + heuristicaBase(ev),
    },
  },
};
