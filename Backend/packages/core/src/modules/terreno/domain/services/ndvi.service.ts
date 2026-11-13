/**
 * NDVI: climatología mensual, meses típicamente baldíos y estrés de vegetación (servicio de dominio puro).
 *
 * REGLA DE BALDÍO (documentada y ajustable):
 *   Un mes es "típicamente baldío" si su NDVI medio (promedio de todos los años) es menor que
 *   FRACCION_BALDIO × (NDVI medio del mes más verde) Y además menor que NDVI_MAXIMO_BALDIO.
 *   - La parte relativa detecta el hueco del calendario de ESE lote (cosecha → siembra).
 *   - El techo absoluto evita marcar como baldío un lote siempre verde (pradera, bosque) que solo baja un poco.
 *   - Si el NDVI máximo del lote es < NDVI_MINIMO_VEGETACION, el lote casi nunca está verde (suelo desnudo,
 *     desierto, zona urbana): no se marcan meses baldíos y se avisa.
 *
 * ESTRÉS DE VEGETACIÓN: en los últimos 12 meses de la serie, los meses cuyo NDVI medio quedó al menos
 * ANOMALIA_ESTRES por debajo de la climatología de ese mes.
 */
import type { NdviDto } from "@agrocore/contracts";

export const FRACCION_BALDIO = 0.6;
export const NDVI_MAXIMO_BALDIO = 0.4;
export const NDVI_MINIMO_VEGETACION = 0.25;
export const ANOMALIA_ESTRES = 0.1;
/** Un mes necesita al menos estas muestras (de 16 días) en todos los años para tener climatología. */
export const MUESTRAS_MINIMAS_MES = 2;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const promedio = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const mesDe = (fecha: string) => Number(fecha.slice(5, 7));

export const REGLA_BALDIO =
  "Mes baldío = NDVI medio del mes < " + FRACCION_BALDIO * 100 + " % del NDVI del mes más verde y < " + NDVI_MAXIMO_BALDIO +
  " (MODIS MOD13Q1, promedio de todos los años analizados).";

export function analizarNdvi(
  muestras: readonly { fecha: string; ndvi: number }[],
  fuente: string,
  desde: string,
  hasta: string,
): NdviDto {
  const ordenadas = [...muestras].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const porMes = new Map<number, number[]>();
  for (const m of ordenadas) porMes.set(mesDe(m.fecha), [...(porMes.get(mesDe(m.fecha)) ?? []), m.ndvi]);
  const climatologia = Array.from({ length: 12 }, (_, i) => {
    const valores = porMes.get(i + 1) ?? [];
    return {
      mes: i + 1,
      ndviMedio: valores.length >= MUESTRAS_MINIMAS_MES ? r3(promedio(valores)) : null,
      muestras: valores.length,
    };
  });

  const conDato = climatologia.filter((c) => c.ndviMedio !== null) as { mes: number; ndviMedio: number }[];
  const maximo = conDato.length ? Math.max(...conDato.map((c) => c.ndviMedio)) : null;

  let mesesBaldios: number[] = [];
  let regla = REGLA_BALDIO;
  if (maximo === null) {
    regla += " Sin datos suficientes para calcularlo.";
  } else if (maximo < NDVI_MINIMO_VEGETACION) {
    regla += " El lote casi nunca está verde (NDVI máximo " + maximo + "): no se marcan meses baldíos.";
  } else {
    const umbral = Math.min(FRACCION_BALDIO * maximo, NDVI_MAXIMO_BALDIO);
    mesesBaldios = conDato.filter((c) => c.ndviMedio < umbral).map((c) => c.mes);
    regla += " Umbral en este lote: " + r3(umbral) + ".";
  }

  // Estrés: últimos 12 meses frente a la climatología.
  const mesesConEstres: number[] = [];
  const anomalias: number[] = [];
  if (ordenadas.length > 0) {
    const ultima = ordenadas[ordenadas.length - 1].fecha;
    const limite = (Number(ultima.slice(0, 4)) - 1) + ultima.slice(4);
    const recientes = ordenadas.filter((m) => m.fecha > limite);
    const recientesPorMes = new Map<number, number[]>();
    for (const m of recientes) recientesPorMes.set(mesDe(m.fecha), [...(recientesPorMes.get(mesDe(m.fecha)) ?? []), m.ndvi]);
    for (const [mes, valores] of recientesPorMes) {
      const normal = climatologia[mes - 1].ndviMedio;
      if (normal === null) continue;
      const anomalia = promedio(valores) - normal;
      anomalias.push(anomalia);
      if (anomalia <= -ANOMALIA_ESTRES) mesesConEstres.push(mes);
    }
  }
  mesesConEstres.sort((a, b) => a - b);
  const anomaliaMedia = anomalias.length ? r3(promedio(anomalias)) : null;

  return {
    fuente,
    desde,
    hasta,
    serie: ordenadas.map((m) => ({ fecha: m.fecha, ndvi: r3(m.ndvi) })),
    climatologia,
    mesesBaldios,
    reglaBaldio: regla,
    estres: {
      mesesConEstres,
      anomaliaMedia,
      detalle: anomaliaMedia === null
        ? "Sin datos recientes suficientes para evaluar el estrés de la vegetación."
        : mesesConEstres.length
        ? "En el último año el NDVI quedó al menos " + ANOMALIA_ESTRES + " por debajo de lo normal en " + mesesConEstres.length +
          " mes(es): posible estrés hídrico, térmico o cambio de uso. Anomalía media " + anomaliaMedia + "."
        : "En el último año el NDVI estuvo dentro de lo normal (anomalía media " + anomaliaMedia + ").",
    },
  };
}
