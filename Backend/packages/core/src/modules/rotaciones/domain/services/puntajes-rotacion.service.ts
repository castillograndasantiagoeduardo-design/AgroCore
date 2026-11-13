/**
 * Puntajes 0–100 de una secuencia por prioridad (agua, suelo, plagas, forraje, ingreso) y puntaje total ponderado.
 * Servicio de dominio puro. El barbecho cuenta como un paso sin cultivo: ahorra agua pero deja el suelo desnudo
 * y no da forraje ni ingreso.
 *
 * Datos sin fuente (`camposSinFuente` del cultivo): `valorForrajero` y `coberturaSuelo` aportan 0.
 *
 * INGRESO (sin precios inventados): escala logarítmica 0–100 del valor bruto de la producción por ha
 * (`presencia.valorHa`, FAOSTAT del país o del mundo) entre el mínimo y el máximo de los valores del catálogo
 * (`ctx.escalaIngreso`). Solo se calcula si el cultivo tiene presencia "local"; si no, el ingreso es null
 * ("sin datos"), aporta 0 y la explicación lo dice.
 */
import type { Nivel, PrioridadesRotacion, ProfundidadRaiz, PuntajesRotacionDto, ValorForrajero } from "@agrocore/contracts";
import { type ContextoMotor, type PasoEvaluado, presenciaDe } from "./evaluar-paso.service.ts";
import { puntajeIngresoLogaritmico } from "./presencia-motor.ts";
import { pasosSembrados, transicionesFamiliaRepetida } from "./reglas-rotacion.service.ts";

const PUNTAJE_AGUA: Record<Nivel, number> = { baja: 100, media: 60, alta: 25 };
export const PUNTAJE_COBERTURA: Record<Nivel, number> = { baja: 20, media: 55, alta: 90 };
const PUNTAJE_RAIZ: Record<ProfundidadRaiz, number> = { superficial: 30, media: 60, profunda: 100 };
export const PUNTAJE_FORRAJE: Record<ValorForrajero, number> = { ninguno: 0, bajo: 25, medio: 60, alto: 100 };
/** Suelo desnudo en barbecho (sin cobertura ni raíces). */
const SUELO_BARBECHO = 15;
/** Penalización del agua cuando hay déficit y no hay riego. */
const PENALIZACION_DEFICIT_AGUA = 25;
/** Plagas: puntos que se restan por cada repetición seguida de familia y por cada siembra extra de la familia más frecuente. */
const PENALIZACION_FAMILIA_REPETIDA = 30;
const PENALIZACION_FAMILIA_FRECUENTE = 15;

const promedio = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Puntajes crudos (sin redondear) de un paso. `ingreso` null = sin datos (aporta 0 al promedio). */
export interface ComponentesPaso {
  agua: number;
  suelo: number;
  forraje: number;
  ingreso: number | null;
}

/** Puntajes crudos de UN paso (el barbecho: agua 100, suelo 15, sin forraje ni ingreso). */
export function componentesPaso(e: PasoEvaluado, ctx: ContextoMotor): ComponentesPaso {
  const c = e.cultivo;
  if (!c) return { agua: 100, suelo: SUELO_BARBECHO, forraje: 0, ingreso: 0 };

  let agua = PUNTAJE_AGUA[c.necesidadAgua];
  if (c.toleranciaSequia === "alta") agua = Math.min(100, agua + 10);
  if (e.paso.deficitAguaMm > 0 && !ctx.tieneRiego) agua = Math.max(0, agua - PENALIZACION_DEFICIT_AGUA);

  const cobertura = c.coberturaConocida();
  const suelo = 0.5 * (cobertura ? PUNTAJE_COBERTURA[cobertura] : 0) + 0.3 * (c.fijaNitrogeno ? 100 : 0) + 0.2 * PUNTAJE_RAIZ[c.profundidadRaiz];

  const forrajeValor = c.valorForrajeroConocido();
  const forraje = forrajeValor ? PUNTAJE_FORRAJE[forrajeValor] : 0;

  let ingreso: number | null = null;
  if (e.presencia === "local" && ctx.escalaIngreso) {
    const valor = presenciaDe(ctx).valorHa(c.clave).valor;
    if (valor !== null) ingreso = puntajeIngresoLogaritmico(valor, ctx.escalaIngreso);
  }
  return { agua, suelo, forraje, ingreso };
}

/** Por qué el ingreso de este paso es "sin datos" (null si sí tiene ingreso o es barbecho). */
export function motivoSinIngreso(e: PasoEvaluado, ctx: ContextoMotor): string | null {
  if (!e.cultivo) return null;
  if (e.presencia === "poco_comun") return "el cultivo es poco sembrado en su zona, no se estima ingreso";
  if (e.presencia !== "local") return "no hay datos de presencia local del cultivo";
  if (presenciaDe(ctx).valorHa(e.cultivo.clave).valor === null) return "sin valor de producción por hectárea en FAOSTAT para este cultivo";
  if (!ctx.escalaIngreso) return "sin escala de ingreso (ningún cultivo del catálogo tiene valor de producción)";
  return null;
}

/**
 * Puntajes 0–100 de sembrar ese cultivo en ese paso (enteros; null = sin datos).
 * `plagas` es siempre null: depende de la secuencia completa, no de un paso aislado.
 */
export function puntajesDeUnPaso(
  ev: PasoEvaluado,
  ctx: ContextoMotor,
): { agua: number | null; suelo: number | null; plagas: number | null; forraje: number | null; ingreso: number | null } {
  const c = componentesPaso(ev, ctx);
  return {
    agua: Math.round(c.agua),
    suelo: Math.round(c.suelo),
    plagas: null,
    forraje: Math.round(c.forraje),
    ingreso: c.ingreso === null ? null : Math.round(c.ingreso),
  };
}

/** Plagas: −30 por cada repetición seguida de familia y −15 por cada siembra extra de la familia más frecuente. */
export function puntajePlagas(evaluados: readonly PasoEvaluado[]): number {
  const sembrados = pasosSembrados(evaluados);
  const conteoFamilias = new Map<string, number>();
  for (const e of sembrados) for (const f of e.cultivo!.familias) conteoFamilias.set(f, (conteoFamilias.get(f) ?? 0) + 1);
  const maxFamilia = Math.max(0, ...conteoFamilias.values());
  return Math.max(0, 100 - PENALIZACION_FAMILIA_REPETIDA * transicionesFamiliaRepetida(evaluados).length - PENALIZACION_FAMILIA_FRECUENTE * Math.max(0, maxFamilia - 1));
}

export function calcularPuntajes(evaluados: readonly PasoEvaluado[], ctx: ContextoMotor): PuntajesRotacionDto {
  const pasos = evaluados.map((e) => componentesPaso(e, ctx));
  return {
    agua: Math.round(promedio(pasos.map((p) => p.agua))),
    suelo: Math.round(promedio(pasos.map((p) => p.suelo))),
    plagas: Math.round(puntajePlagas(evaluados)),
    forraje: Math.round(promedio(pasos.map((p) => p.forraje))),
    ingreso: Math.round(promedio(pasos.map((p) => p.ingreso ?? 0))),
  };
}

/** Promedio ponderado con los pesos del agricultor; si todos los pesos son 0, promedio simple. */
export function calcularPuntajeTotal(puntajes: PuntajesRotacionDto, prioridades: PrioridadesRotacion): number {
  const claves = ["agua", "suelo", "plagas", "forraje", "ingreso"] as const;
  const sumaPesos = claves.reduce((s, k) => s + prioridades[k], 0);
  if (sumaPesos === 0) return Math.round(promedio(claves.map((k) => puntajes[k])));
  return Math.round(claves.reduce((s, k) => s + prioridades[k] * puntajes[k], 0) / sumaPesos);
}
