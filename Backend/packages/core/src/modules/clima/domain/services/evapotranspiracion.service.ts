/**
 * Evapotranspiración de referencia (ET0) por el método de Hargreaves–Samani (servicio de dominio puro).
 *
 *   ET0 [mm/día] = 0,0023 · 0,408 · Ra · (Tmedia + 17,8) · √(Tmáx − Tmín)
 *
 * Ra = radiación extraterrestre [MJ m⁻² día⁻¹], calculada con la latitud y el día del año
 * (FAO-56, ecuaciones 21–25). 0,408 convierte MJ m⁻² a mm de agua evaporada.
 * Fuente: Allen et al. (1998), FAO Irrigation and Drainage Paper 56, ecuación 52.
 *
 * Solo usa temperaturas (que NASA POWER entrega en todo el mundo) y es la opción que FAO-56
 * recomienda cuando faltan radiación, humedad o viento medidos. Error típico ±10–15 % mensual.
 */

const GSC = 0.082; // constante solar, MJ m⁻² min⁻¹
/** Día juliano del día 15 de cada mes (año no bisiesto). */
const DIA_MEDIO_MES = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
const DIAS_MES = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Radiación extraterrestre Ra (MJ m⁻² día⁻¹) para una latitud y un día del año (FAO-56 ec. 21). */
export function radiacionExtraterrestre(latitud: number, diaDelAnio: number): number {
  const phi = (latitud * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * diaDelAnio) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * diaDelAnio) / 365 - 1.39);
  const x = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta)));
  const ws = Math.acos(x);
  const ra = ((24 * 60) / Math.PI) * GSC * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
  return Math.max(0, ra);
}

/** ET0 diaria (mm/día) por Hargreaves. */
export function et0HargreavesDia(ra: number, tMedia: number, tMin: number, tMax: number): number {
  return Math.max(0, 0.0023 * 0.408 * ra * (tMedia + 17.8) * Math.sqrt(Math.max(0, tMax - tMin)));
}

/** ET0 total del mes (mm) usando las temperaturas medias del mes y la Ra del día 15. */
export function et0MensualMm(latitud: number, mes: number, tMedia: number, tMin: number, tMax: number): number {
  const ra = radiacionExtraterrestre(latitud, DIA_MEDIO_MES[mes - 1]);
  return et0HargreavesDia(ra, tMedia, tMin, tMax) * DIAS_MES[mes - 1];
}
