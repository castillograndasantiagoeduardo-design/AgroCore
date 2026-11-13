/**
 * Puntajes 0–100 de una secuencia por prioridad (agua, suelo, plagas, forraje, ingreso) y puntaje total ponderado.
 * Servicio de dominio puro. El barbecho cuenta como un paso sin cultivo: ahorra agua pero deja el suelo desnudo
 * y no da forraje ni ingreso.
 */
import type { Nivel, PrioridadesRotacion, ProfundidadRaiz, PuntajesRotacionDto, ValorForrajero } from "@agrocore/contracts";
import type { PasoEvaluado } from "./evaluar-paso.service.ts";
import { puntajeIngresoReferencia } from "./referencias-ingreso.ts";
import { pasosSembrados, transicionesFamiliaRepetida } from "./reglas-rotacion.service.ts";

const PUNTAJE_AGUA: Record<Nivel, number> = { baja: 100, media: 60, alta: 25 };
const PUNTAJE_COBERTURA: Record<Nivel, number> = { baja: 20, media: 55, alta: 90 };
const PUNTAJE_RAIZ: Record<ProfundidadRaiz, number> = { superficial: 30, media: 60, profunda: 100 };
const PUNTAJE_FORRAJE: Record<ValorForrajero, number> = { ninguno: 0, bajo: 25, medio: 60, alto: 100 };
/** Suelo desnudo en barbecho (sin cobertura ni raíces). */
const SUELO_BARBECHO = 15;

const promedio = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

export function calcularPuntajes(evaluados: readonly PasoEvaluado[], tieneRiego: boolean): PuntajesRotacionDto {
  const agua = promedio(evaluados.map((e) => {
    if (!e.cultivo) return 100;
    let base = PUNTAJE_AGUA[e.cultivo.necesidadAgua];
    if (e.cultivo.toleranciaSequia === "alta") base = Math.min(100, base + 10);
    return e.paso.deficitAguaMm > 0 && !tieneRiego ? Math.max(0, base - 25) : base;
  }));

  // Suelo: cobertura (erosión), fijación de N y profundidad de raíz (infiltración).
  const suelo = promedio(evaluados.map((e) =>
    !e.cultivo
      ? SUELO_BARBECHO
      : 0.5 * PUNTAJE_COBERTURA[e.cultivo.coberturaSuelo] + 0.3 * (e.cultivo.fijaNitrogeno ? 100 : 0) + 0.2 * PUNTAJE_RAIZ[e.cultivo.profundidadRaiz]
  ));

  // Plagas: −30 por cada repetición seguida de familia y −15 por cada siembra extra de la familia más frecuente.
  const sembrados = pasosSembrados(evaluados);
  const conteoFamilias = new Map<string, number>();
  for (const e of sembrados) for (const f of e.cultivo!.familias) conteoFamilias.set(f, (conteoFamilias.get(f) ?? 0) + 1);
  const maxFamilia = Math.max(0, ...conteoFamilias.values());
  const plagas = Math.max(0, 100 - 30 * transicionesFamiliaRepetida(evaluados).length - 15 * Math.max(0, maxFamilia - 1));

  const forraje = promedio(evaluados.map((e) => (e.cultivo ? PUNTAJE_FORRAJE[e.cultivo.valorForrajero] : 0)));
  const ingreso = promedio(evaluados.map((e) => (e.cultivo ? puntajeIngresoReferencia(e.cultivo.clave, e.cultivo.grupo) : 0)));

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
