/**
 * Calibración de NASA POWER con una estación del IDEAM (servicio de dominio puro).
 *
 * Método: "corrección de sesgo mensual" (delta para temperatura, razón para lluvia).
 *
 *  1. Se toma NASA POWER EN EL PUNTO DE LA ESTACIÓN, para los MISMOS años de la normal (1991–2020),
 *     y se lleva a la altitud de la estación con el gradiente térmico.
 *  2. Para cada mes se compara con lo que midió el IDEAM:
 *        deltaT       = T_IDEAM − T_NASA          (°C que hay que sumarle a la NASA)
 *        factorLluvia = Lluvia_IDEAM / Lluvia_NASA (por cuánto hay que multiplicar la NASA)
 *  3. Esas correcciones se aplican, día por día, a la serie de la finca.
 *
 * Supuesto: el error de la NASA es parecido en la estación y en la finca (por eso la estación
 * debe estar cerca: ver DISTANCIA_MAX_CALIBRACION_KM).
 */
import type { FactorCalibracionDto } from "@agrocore/contracts";
import type { RegistroClimaDiario } from "../value-objects/registro-clima-diario.vo.ts";
import type { NormalClimatologica } from "../value-objects/normal-climatologica.vo.ts";
import { calcularCalendarioMensual } from "./calendario-climatico.service.ts";

/** Más allá de esta distancia la estación ya no representa el clima de la finca. */
export const DISTANCIA_MAX_CALIBRACION_KM = 25;

/** Límites del factor de lluvia para evitar correcciones absurdas por datos raros. */
export const FACTOR_LLUVIA_MIN = 0.2;
export const FACTOR_LLUVIA_MAX = 5;

const redondear2 = (v: number) => Math.round(v * 100) / 100;

/** Distancia en km entre dos puntos (fórmula del haversine). */
export function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/**
 * @param normal normal climatológica IDEAM de la estación
 * @param registrosNasaEstacion serie diaria NASA POWER en el punto de la estación, años de la normal
 * @param ajusteCeldaAEstacionC corrección por altitud de la celda NASA a la altitud de la estación
 * @returns 12 factores, o null si la serie NASA no alcanza para los 12 meses
 */
export function calcularFactoresCalibracion(
  normal: NormalClimatologica,
  registrosNasaEstacion: RegistroClimaDiario[],
  ajusteCeldaAEstacionC: number,
): FactorCalibracionDto[] | null {
  const nasa = calcularCalendarioMensual(registrosNasaEstacion, ajusteCeldaAEstacionC, normal.latitud);
  if (nasa.length !== 12) return null;

  return normal.meses.map((ideam, i) => {
    const n = nasa[i];
    const factor = n.lluviaMm < 1 ? 1 : ideam.lluviaMm / n.lluviaMm;
    return {
      mes: ideam.mes,
      deltaTminC: redondear2(ideam.tempMinC - n.tempMinC),
      deltaTmediaC: redondear2(ideam.tempMediaC - n.tempMediaC),
      deltaTmaxC: redondear2(ideam.tempMaxC - n.tempMaxC),
      factorLluvia: redondear2(Math.min(FACTOR_LLUVIA_MAX, Math.max(FACTOR_LLUVIA_MIN, factor))),
    };
  });
}

/** Aplica los factores mensuales a cada día de la serie (devuelve una serie nueva). */
export function aplicarCalibracion(registros: RegistroClimaDiario[], factores: FactorCalibracionDto[]): RegistroClimaDiario[] {
  const porMes = new Map(factores.map((f) => [f.mes, f]));
  return registros.map((r) => {
    const f = porMes.get(Number(r.fecha.slice(5, 7)));
    if (!f) return r;
    return {
      fecha: r.fecha,
      lluviaMm: r.lluviaMm === null ? null : r.lluviaMm * f.factorLluvia,
      tempMinC: r.tempMinC === null ? null : r.tempMinC + f.deltaTminC,
      tempMediaC: r.tempMediaC === null ? null : r.tempMediaC + f.deltaTmediaC,
      tempMaxC: r.tempMaxC === null ? null : r.tempMaxC + f.deltaTmaxC,
    };
  });
}
