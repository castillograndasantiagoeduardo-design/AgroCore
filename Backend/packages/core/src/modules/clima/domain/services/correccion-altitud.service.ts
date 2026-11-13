/**
 * Corrección de temperatura por altitud (servicio de dominio puro).
 *
 * NASA POWER entrega la temperatura promedio de una celda de decenas de km, con UNA altitud
 * promedio. En Duitama el terreno va de ~2.500 m (valle) a más de 3.500 m (páramo), así que
 * esa temperatura no sirve igual para todas los sitios.
 *
 * Regla física: el aire se enfría ~0,65 °C por cada 100 m que se sube
 * (gradiente térmico ambiental estándar, 0,0065 °C/m).
 *
 *   ajuste = (altitudCelda − altitudSitio) × 0,0065
 *
 * Sitio MÁS ALTO que la celda → ajuste negativo (más frío).
 * Sitio MÁS BAJO que la celda → ajuste positivo (más cálido).
 */
export const GRADIENTE_TERMICO_C_POR_M = 0.0065;

/** Diferencia de altitud a partir de la cual la corrección pierde precisión. */
export const DIFERENCIA_ALTITUD_GRANDE_M = 300;

export function calcularAjusteTemperatura(altitudCeldaM: number, altitudSitioM: number): number {
  return (altitudCeldaM - altitudSitioM) * GRADIENTE_TERMICO_C_POR_M;
}
