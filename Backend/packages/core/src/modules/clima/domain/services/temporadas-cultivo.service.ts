/**
 * Temporadas de cultivo DERIVADAS del perfil climático (servicio de dominio puro).
 * Reemplazan las ventanas fijas de marzo / septiembre del altiplano: sirven en cualquier clima
 * (régimen unimodal o bimodal, hemisferio sur, climas con invierno o con verano seco).
 *
 * Un mes es APTO para cultivar si:
 *   1. tempMediaC ≥ TEMP_MINIMA_CRECIMIENTO_C            (por debajo casi ningún cultivo crece)
 *   2. NO tiene riesgo alto de helada: mínima media del mes ≤ TMIN_MEDIA_HELADA_DURA_C (helada dura casi todas
 *      las noches) o ≥ DIAS_HELADA_RIESGO_ALTO días de helada al mes. Las heladas leves y esporádicas NO
 *      cierran la temporada: el motor de rotaciones las cruza con la tolerancia de cada cultivo
 *      (así el invierno mediterráneo sigue siendo temporada de cereales de secano).
 *   3. agua: en SECANO, lluvia ≥ FRACCION_ET0_SECANO × ET0 del mes; CON RIEGO este requisito no aplica.
 *
 * Temporadas = tramos circulares de meses aptos de al menos DURACION_MINIMA_MESES.
 *   - Si hay más de 2 tramos se conservan los 2 más largos.
 *   - Un único tramo de ≥ MESES_PARA_DIVIDIR meses (trópico húmedo, o riego en clima templado) se divide
 *     en dos temporadas, porque caben dos ciclos por año.
 *   - Los meses que quedan fuera de toda temporada son el "intervalo" (invierno o estación seca): se
 *     aprovechan con cobertura, abono verde o barbecho.
 */

export const TEMP_MINIMA_CRECIMIENTO_C = 5;
export const DIAS_HELADA_RIESGO_ALTO = 15;
export const TMIN_MEDIA_HELADA_DURA_C = 0;

export const FRACCION_ET0_SECANO = 0.5;
export const DURACION_MINIMA_MESES = 3;
export const MESES_PARA_DIVIDIR = 10;

export interface MesClimaTemporada {
  mes: number;
  tempMediaC: number;
  tempMinC: number;
  probabilidadHelada: number;
  diasHeladaPromedio: number;
  lluviaMm: number;
  etoMm: number;
}

export interface TemporadaCultivo {
  /** Mes en que empieza (siembra). */
  inicioMes: number;
  /** Meses que dura, en orden (con vuelta de diciembre a enero). */
  meses: number[];
}

export interface TemporadasCultivo {
  secano: TemporadaCultivo[];
  conRiego: TemporadaCultivo[];
  /** Meses aptos por temperatura y helada (el techo de lo que se puede hacer con riego). */
  mesesAptosTermicos: number[];
  /** Meses aptos también por lluvia (secano). */
  mesesAptosSecano: number[];
  regla: string;
}

export const REGLA_TEMPORADAS =
  "Mes apto = temperatura media ≥ " + TEMP_MINIMA_CRECIMIENTO_C + " °C, sin helada dura (mínima media ≤ " + TMIN_MEDIA_HELADA_DURA_C + " °C o ≥ " +
  DIAS_HELADA_RIESGO_ALTO + " días de helada al mes) y, en secano, lluvia ≥ " +
  FRACCION_ET0_SECANO * 100 + " % de la ET0. Temporada = meses aptos seguidos (mínimo " + DURACION_MINIMA_MESES +
  "); un tramo de " + MESES_PARA_DIVIDIR + "+ meses se divide en dos temporadas.";

export function mesAptoTermico(m: MesClimaTemporada): boolean {
  const heladaAlta = m.tempMinC <= TMIN_MEDIA_HELADA_DURA_C || m.diasHeladaPromedio >= DIAS_HELADA_RIESGO_ALTO;
  return m.tempMediaC >= TEMP_MINIMA_CRECIMIENTO_C && !heladaAlta;
}

export function mesAptoSecano(m: MesClimaTemporada): boolean {
  return mesAptoTermico(m) && m.lluviaMm >= FRACCION_ET0_SECANO * m.etoMm;
}

/** Tramos circulares de meses marcados (1..12), cada uno en orden cronológico desde su inicio. */
export function tramosCirculares(aptos: ReadonlySet<number>): number[][] {
  if (aptos.size === 0) return [];
  if (aptos.size === 12) return [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]];
  // Arrancar justo después de un mes no apto para no partir un tramo que cruza diciembre → enero.
  let inicio = 1;
  while (aptos.has(inicio)) inicio = (inicio % 12) + 1;
  const tramos: number[][] = [];
  let actual: number[] = [];
  for (let i = 0; i < 12; i++) {
    const mes = ((inicio - 1 + i) % 12) + 1;
    if (aptos.has(mes)) actual.push(mes);
    else if (actual.length) {
      tramos.push(actual);
      actual = [];
    }
  }
  if (actual.length) tramos.push(actual);
  return tramos;
}

function aTemporadas(tramos: number[][]): TemporadaCultivo[] {
  let validos = tramos.filter((t) => t.length >= DURACION_MINIMA_MESES);
  if (validos.length > 2) validos = [...validos].sort((a, b) => b.length - a.length).slice(0, 2);
  if (validos.length === 1 && validos[0].length >= MESES_PARA_DIVIDIR) {
    const t = validos[0];
    const mitad = Math.ceil(t.length / 2);
    validos = [t.slice(0, mitad), t.slice(mitad)];
  }
  return validos
    .map((meses) => ({ inicioMes: meses[0], meses }))
    .sort((a, b) => a.inicioMes - b.inicioMes);
}

export function calcularTemporadasCultivo(meses: readonly MesClimaTemporada[]): TemporadasCultivo {
  const termicos = meses.filter(mesAptoTermico).map((m) => m.mes);
  const secano = meses.filter(mesAptoSecano).map((m) => m.mes);
  return {
    secano: aTemporadas(tramosCirculares(new Set(secano))),
    conRiego: aTemporadas(tramosCirculares(new Set(termicos))),
    mesesAptosTermicos: termicos,
    mesesAptosSecano: secano,
    regla: REGLA_TEMPORADAS,
  };
}
