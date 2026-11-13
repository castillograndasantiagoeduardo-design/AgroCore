/**
 * Puntajes 0–100 de una secuencia por prioridad (agua, suelo, plagas, forraje, ingreso) y puntaje total ponderado.
 * Servicio de dominio puro.
 */
import type { Nivel, PrioridadesRotacion, PuntajesRotacionDto, ValorForrajero } from "@agrocore/contracts";
import type { Cultivo } from "../../../cultivos/domain/entities/cultivo.entity.ts";
import type { PasoEvaluado } from "./evaluar-paso.service.ts";
import { puntajeIngresoReferencia } from "./referencias-ingreso.ts";
import { transicionesFamiliaRepetida } from "./reglas-rotacion.service.ts";

const PUNTAJE_AGUA: Record<Nivel, number> = { baja: 100, media: 60, alta: 25 };
const PUNTAJE_COBERTURA: Record<Nivel, number> = { baja: 20, media: 55, alta: 90 };
const PUNTAJE_FORRAJE: Record<ValorForrajero, number> = { ninguno: 0, bajo: 25, medio: 60, alto: 100 };

const promedio = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

export function calcularPuntajes(
  cultivos: readonly Cultivo[],
  evaluados: readonly PasoEvaluado[],
  tieneRiego: boolean,
): PuntajesRotacionDto {
  const agua = promedio(cultivos.map((c, i) => {
    const base = PUNTAJE_AGUA[c.necesidadAgua];
    return evaluados[i].paso.deficitAguaMm > 0 && !tieneRiego ? Math.max(0, base - 25) : base;
  }));
  const suelo = promedio(cultivos.map((c) => 0.6 * PUNTAJE_COBERTURA[c.coberturaSuelo] + 0.4 * (c.fijaNitrogeno ? 100 : 0)));

  const repetidas = transicionesFamiliaRepetida(cultivos, evaluados).length;
  const semestresSolanaceas = cultivos.filter((c) => c.perteneceAFamilia("solanaceas")).length;
  const plagas = Math.max(0, 100 - 30 * repetidas - 15 * Math.max(0, semestresSolanaceas - 1));

  const forraje = promedio(cultivos.map((c) => PUNTAJE_FORRAJE[c.valorForrajero]));
  const ingreso = promedio(cultivos.map((c) => puntajeIngresoReferencia(c.clave)));

  return {
    agua: Math.round(agua),
    suelo: Math.round(suelo),
    plagas: Math.round(plagas),
    forraje: Math.round(forraje),
    ingreso: Math.round(ingreso),
  };
}

/** Promedio ponderado con los pesos del agricultor; si todos los pesos son 0, promedio simple. */
export function calcularPuntajeTotal(puntajes: PuntajesRotacionDto, prioridades: PrioridadesRotacion): number {
  const claves = ["agua", "suelo", "plagas", "forraje", "ingreso"] as const;
  const sumaPesos = claves.reduce((s, k) => s + prioridades[k], 0);
  if (sumaPesos === 0) return Math.round(promedio(claves.map((k) => puntajes[k])));
  return Math.round(claves.reduce((s, k) => s + prioridades[k] * puntajes[k], 0) / sumaPesos);
}
