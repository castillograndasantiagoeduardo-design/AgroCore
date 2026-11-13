/**
 * Clasificación climática genérica del sitio (servicio de dominio puro).
 * Reemplaza la antigua "zona altitudinal" de Duitama (valle / ladera / alta), que solo servía allí.
 *
 * Regla (simplificación de Köppen basada en la temperatura media mensual YA corregida por altitud):
 *   1. tropical     → el mes más frío tiene media ≥ 18 °C.
 *   2. de_altura    → zona intertropical (|lat| ≤ 23,5°), media anual < 18 °C y amplitud anual < 6 °C
 *                     (trópico de montaña: casi la misma temperatura todo el año, ej. Duitama o Nakuru).
 *   3. subtropical  → el mes más frío tiene media ≥ 10 °C.
 *   4. templado     → el mes más frío tiene media ≥ 0 °C.
 *   5. frio         → el mes más frío tiene media < 0 °C (inviernos con suelo congelado, ej. Iowa).
 */
import type { ClasificacionClimatica } from "@agrocore/contracts";

export const LATITUD_INTERTROPICAL = 23.5;
export const MEDIA_MES_FRIO_TROPICAL_C = 18;
export const AMPLITUD_ISOTERMA_C = 6;

export function clasificarClima(tempMediaMensualC: readonly number[], latitud: number): ClasificacionClimatica {
  const frio = Math.min(...tempMediaMensualC);
  const calido = Math.max(...tempMediaMensualC);
  const anual = tempMediaMensualC.reduce((a, b) => a + b, 0) / tempMediaMensualC.length;
  if (frio >= MEDIA_MES_FRIO_TROPICAL_C) return "tropical";
  if (Math.abs(latitud) <= LATITUD_INTERTROPICAL && anual < MEDIA_MES_FRIO_TROPICAL_C && calido - frio < AMPLITUD_ISOTERMA_C) {
    return "de_altura";
  }
  if (frio >= 10) return "subtropical";
  if (frio >= 0) return "templado";
  return "frio";
}
