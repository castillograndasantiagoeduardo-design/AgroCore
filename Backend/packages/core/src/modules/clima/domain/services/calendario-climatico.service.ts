/**
 * Calendario climático mensual (servicio de dominio puro).
 *
 * Convierte ~30 años de datos diarios en 12 filas (enero..diciembre) con:
 * lluvia, temperaturas corregidas por altitud, riesgo de helada, lluvias fuertes y temporada.
 */
import type { ClimaMensualDto } from "@agrocore/contracts";
import type { RegistroClimaDiario } from "../value-objects/registro-clima-diario.vo.ts";

/**
 * Umbral de helada: temperatura mínima del aire a 2 m ≤ 2 °C.
 * En noches despejadas del altiplano el suelo y las hojas quedan 2–4 °C más fríos que el aire
 * a 2 m, así que con 2 °C en el aire ya hay escarcha en el cultivo ("helada agrometeorológica").
 */
export const UMBRAL_HELADA_C = 2;

/** Día de lluvia fuerte: ≥ 20 mm en 24 h (genera escorrentía y erosión en ladera). */
export const UMBRAL_LLUVIA_FUERTE_MM = 20;

/** Un mes-año solo cuenta si tiene al menos estos días con datos válidos. */
export const DIAS_MINIMOS_POR_MES = 20;

/** Meses con probabilidad de helada ≥ este valor se consideran de riesgo. */
export const PROBABILIDAD_RIESGO_HELADA = 0.25;

export const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

interface AcumuladoMesAnio {
  diasValidos: number;
  lluviaTotal: number;
  diasHelada: number;
  diasLluviaFuerte: number;
  sumaMedia: number;
  sumaMin: number;
  sumaMax: number;
  diasTemp: number;
}

const redondear = (valor: number, decimales = 1) => {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
};

const promedio = (valores: number[]) => (valores.length === 0 ? 0 : valores.reduce((a, b) => a + b, 0) / valores.length);

/**
 * @param registros datos diarios del proveedor (valores faltantes = null)
 * @param ajusteTemperaturaC grados a sumar a cada temperatura (ver correccion-altitud.service.ts)
 * @returns 12 meses; vacío si no hay ningún mes con datos suficientes
 */
export function calcularCalendarioMensual(
  registros: RegistroClimaDiario[],
  ajusteTemperaturaC: number,
): ClimaMensualDto[] {
  // 1. Acumular por (año, mes)
  const porMesAnio = new Map<string, AcumuladoMesAnio>();
  for (const r of registros) {
    if (r.lluviaMm === null && r.tempMinC === null) continue;
    const clave = r.fecha.slice(0, 7); // "YYYY-MM"
    const acc = porMesAnio.get(clave) ??
      { diasValidos: 0, lluviaTotal: 0, diasHelada: 0, diasLluviaFuerte: 0, sumaMedia: 0, sumaMin: 0, sumaMax: 0, diasTemp: 0 };

    acc.diasValidos++;
    if (r.lluviaMm !== null) {
      acc.lluviaTotal += r.lluviaMm;
      if (r.lluviaMm >= UMBRAL_LLUVIA_FUERTE_MM) acc.diasLluviaFuerte++;
    }
    if (r.tempMinC !== null && r.tempMediaC !== null && r.tempMaxC !== null) {
      const min = r.tempMinC + ajusteTemperaturaC;
      acc.sumaMin += min;
      acc.sumaMedia += r.tempMediaC + ajusteTemperaturaC;
      acc.sumaMax += r.tempMaxC + ajusteTemperaturaC;
      acc.diasTemp++;
      if (min <= UMBRAL_HELADA_C) acc.diasHelada++;
    }
    porMesAnio.set(clave, acc);
  }

  // 2. Agrupar los años de cada mes (descarta meses-año con pocos datos)
  const porMes = new Map<number, AcumuladoMesAnio[]>();
  for (const [clave, acc] of porMesAnio) {
    if (acc.diasValidos < DIAS_MINIMOS_POR_MES || acc.diasTemp === 0) continue;
    const mes = Number(clave.slice(5, 7));
    porMes.set(mes, [...(porMes.get(mes) ?? []), acc]);
  }
  if (porMes.size < 12) return [];

  // 3. Promediar entre años
  const meses = NOMBRES_MES.map((nombreMes, i) => {
    const anios = porMes.get(i + 1)!;
    return {
      mes: i + 1,
      nombreMes,
      lluviaMm: promedio(anios.map((a) => a.lluviaTotal)),
      tempMediaC: promedio(anios.map((a) => a.sumaMedia / a.diasTemp)),
      tempMinC: promedio(anios.map((a) => a.sumaMin / a.diasTemp)),
      tempMaxC: promedio(anios.map((a) => a.sumaMax / a.diasTemp)),
      diasHeladaPromedio: promedio(anios.map((a) => a.diasHelada)),
      probabilidadHelada: anios.filter((a) => a.diasHelada > 0).length / anios.length,
      diasLluviaFuertePromedio: promedio(anios.map((a) => a.diasLluviaFuerte)),
    };
  });

  // 4. Temporada: un mes es "lluvioso" si llueve al menos el promedio mensual del año
  const promedioMensual = promedio(meses.map((m) => m.lluviaMm));

  return meses.map((m) => ({
    mes: m.mes,
    nombreMes: m.nombreMes,
    lluviaMm: redondear(m.lluviaMm),
    tempMediaC: redondear(m.tempMediaC),
    tempMinC: redondear(m.tempMinC),
    tempMaxC: redondear(m.tempMaxC),
    diasHeladaPromedio: redondear(m.diasHeladaPromedio),
    probabilidadHelada: redondear(m.probabilidadHelada, 2),
    diasLluviaFuertePromedio: redondear(m.diasLluviaFuertePromedio),
    temporada: m.lluviaMm >= promedioMensual ? "lluviosa" : "seca",
  }));
}
