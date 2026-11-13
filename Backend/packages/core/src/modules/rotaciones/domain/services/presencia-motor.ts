/**
 * Presencia local de los cultivos tal como la usa el motor (servicio de dominio, sin dependencias externas).
 *
 * La arma la capa de aplicación a partir del puerto IPresenciaLocalProvider (EVA en Colombia, FAOSTAT fuera):
 *   local       el cultivo se siembra en la zona (área > 0 en la fuente)
 *   poco_comun  la fuente cubre el cultivo y NO aparece en la zona
 *   sin_datos   la fuente no cubre el cultivo, o no respondió
 */
import type { DatoConFuente, PresenciaLocalNivel } from "@agrocore/contracts";

export interface PresenciaMotor {
  /** false = la fuente no respondió o no hay fuente para este lugar: no se prefiere ningún cultivo. */
  disponible: boolean;
  nivel(clave: string): PresenciaLocalNivel;
  /** Área sembrada en la zona (ha), o null. */
  areaHa(clave: string): DatoConFuente<number>;
  /** Valor bruto de la producción por hectárea (FAOSTAT del país, o del mundo si el país no tiene dato). */
  valorHa(clave: string): DatoConFuente<number>;
}

/** Presencia desconocida: todos los cultivos quedan "sin_datos" y el ingreso queda sin datos. */
export const PRESENCIA_DESCONOCIDA: PresenciaMotor = {
  disponible: false,
  nivel: () => "sin_datos",
  areaHa: () => ({ valor: null, unidad: "ha", fuente: "EVA", tipo: "medido", nota: "Sin datos de presencia local" }),
  valorHa: () => ({ valor: null, unidad: "I$/ha", fuente: "FAOSTAT", tipo: "referencia", nota: "Sin datos de FAOSTAT" }),
};

/** Escala del puntaje de ingreso: valor bruto de la producción por ha (I$/ha) mínimo y máximo entre los cultivos con dato. */
export interface EscalaIngreso {
  min: number;
  max: number;
}

/**
 * Escala del ingreso a partir del valor por ha que `presencia.valorHa` da para cada cultivo del catálogo
 * (solo valores positivos). null si ningún cultivo tiene dato.
 */
export function calcularEscalaIngreso(catalogo: readonly { clave: string }[], presencia: PresenciaMotor): EscalaIngreso | null {
  let min = Infinity;
  let max = -Infinity;
  for (const c of catalogo) {
    const v = presencia.valorHa(c.clave).valor;
    if (v === null || !(v > 0)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Infinity ? null : { min, max };
}

/** Puntaje 0–100 en escala logarítmica entre el mínimo y el máximo de la escala (50 si hay un solo valor distinto). */
export function puntajeIngresoLogaritmico(valorHa: number, escala: EscalaIngreso): number {
  if (!(valorHa > 0)) return 0;
  if (escala.max <= escala.min) return 50;
  const p = (Math.log(valorHa) - Math.log(escala.min)) / (Math.log(escala.max) - Math.log(escala.min));
  return 100 * Math.min(1, Math.max(0, p));
}
