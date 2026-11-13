/**
 * Calendario mensual APROXIMADO a partir de la climatología de NASA POWER (promedios mensuales de largo plazo),
 * para la etapa rápida cuando la serie diaria de 30 años todavía no está en caché (servicio de dominio puro).
 *
 * Qué es igual a la serie diaria: lluvia, temperaturas (con la misma corrección por altitud), ET0 (Hargreaves) y
 * temporada lluviosa / seca.
 * Qué es aproximado (y se declara en las advertencias del perfil):
 *   - Días de helada: POWER FROST_DAYS cuenta días con mínima < 0 °C (no ≤ UMBRAL_HELADA_C) y no se puede corregir
 *     por altitud. La probabilidad de helada se toma como min(1, días de helada promedio): una cota superior.
 *   - Días de calor: no hay conteo diario; se marca el mes como caluroso (DIAS_CALOR_MES_CRITICO días) si la
 *     máxima MEDIA alcanza UMBRAL_CALOR_C, y 0 si no.
 *   - Días de lluvia fuerte: no hay conteo diario → 0 (no se detectan meses de lluvia extrema).
 */
import type { ClimaMensualDto } from "@agrocore/contracts";
import type { ClimatologiaMensual } from "../../application/ports/index.ts";
import { NOMBRES_MES, UMBRAL_CALOR_C } from "./calendario-climatico.service.ts";
import { et0MensualMm } from "./evapotranspiracion.service.ts";
import { DIAS_CALOR_MES_CRITICO } from "./resumen-climatico.service.ts";

const r = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

export const ADVERTENCIA_CLIMATOLOGIA =
  "Clima aproximado con los promedios mensuales de NASA POWER: los días de helada y de calor son estimados. " +
  "El detalle usa la serie diaria completa.";

export function calendarioDesdeClimatologia(clim: ClimatologiaMensual, ajusteTemperaturaC: number, latitud: number): ClimaMensualDto[] {
  const meses = [...clim.meses].sort((a, b) => a.mes - b.mes);
  if (meses.length !== 12) return [];
  const promedioLluvia = meses.reduce((s, m) => s + m.lluviaMm, 0) / 12;
  return meses.map((m) => {
    const tMedia = m.tempMediaC + ajusteTemperaturaC;
    const tMin = m.tempMinC + ajusteTemperaturaC;
    const tMax = m.tempMaxC + ajusteTemperaturaC;
    const eto = et0MensualMm(latitud, m.mes, tMedia, tMin, tMax);
    const diasHelada = m.diasHelada ?? 0;
    return {
      mes: m.mes,
      nombreMes: NOMBRES_MES[m.mes - 1],
      lluviaMm: r(m.lluviaMm),
      tempMediaC: r(tMedia),
      tempMinC: r(tMin),
      tempMaxC: r(tMax),
      diasHeladaPromedio: r(diasHelada),
      probabilidadHelada: r(Math.min(1, diasHelada), 2),
      diasLluviaFuertePromedio: 0,
      diasCalorPromedio: tMax >= UMBRAL_CALOR_C ? DIAS_CALOR_MES_CRITICO : 0,
      etoMm: r(eto),
      balanceHidricoMm: r(m.lluviaMm - eto),
      temporada: m.lluviaMm >= promedioLluvia ? "lluviosa" : "seca",
    };
  });
}
